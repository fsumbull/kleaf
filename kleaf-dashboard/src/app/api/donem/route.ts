import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiSession, getScope } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { MERKEZ_ROLLER } from "@/lib/yetki";

const schema = z.object({
  year: z.number().int().min(2000).max(2100),
  month: z.number().int().min(1).max(12),
  action: z.enum(["KAPAT", "AC"]),
});

/** Dönem kilitleme/açma — yalnız merkez (iklim merkezi / süper admin). */
export async function POST(req: Request) {
  const session = await apiSession(MERKEZ_ROLLER);
  if (!session) return NextResponse.json({ error: "Yetkiniz yok" }, { status: 403 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Geçersiz veri" }, { status: 400 });
  }
  const { year, month, action } = parsed.data;
  const { org } = await getScope();

  if (action === "KAPAT") {
    // Kapanacak dönemde taslak/ara onaylı kayıt kalmamalı
    const bekleyen = await prisma.activityData.count({
      where: { facility: { orgId: org.id }, year, month, status: { not: "ONAYLI" } },
    });
    if (bekleyen > 0) {
      return NextResponse.json(
        { error: `Bu dönemde ${bekleyen} onaylanmamış kayıt var — önce onaylayın veya silin.` },
        { status: 409 }
      );
    }
    await prisma.period.upsert({
      where: { orgId_year_month: { orgId: org.id, year, month } },
      create: { orgId: org.id, year, month, status: "KAPANDI", closedAt: new Date() },
      update: { status: "KAPANDI", closedAt: new Date() },
    });
    await audit(session.sub, "DONEM_KAPAT", "Period", `${org.id}:${year}-${month}`, `${year}-${String(month).padStart(2, "0")}`, session.email);
  } else {
    await prisma.period.upsert({
      where: { orgId_year_month: { orgId: org.id, year, month } },
      create: { orgId: org.id, year, month, status: "ACIK", closedAt: null },
      update: { status: "ACIK", closedAt: null },
    });
    await audit(session.sub, "DONEM_AC", "Period", `${org.id}:${year}-${month}`, `${year}-${String(month).padStart(2, "0")}`, session.email);
  }
  return NextResponse.json({ ok: true });
}
