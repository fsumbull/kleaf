import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiSession } from "@/lib/auth";
import { audit } from "@/lib/audit";

const schema = z.object({
  orgId: z.string().min(1),
  year: z.number().int().min(2000).max(2100),
  targetTCO2e: z.number().min(0, "Hedef negatif olamaz").nullable(), // null → hedefi kaldır
});

/** Yıl hedefi ekler/günceller/kaldırır. */
export async function PUT(req: Request) {
  const session = await apiSession(["SUPER_ADMIN", "IKLIM_MERKEZI"]);
  if (!session) return NextResponse.json({ error: "Yetkiniz yok" }, { status: 403 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Geçersiz veri" }, { status: 400 });
  }
  const d = parsed.data;
  if (session.role !== "SUPER_ADMIN" && d.orgId !== session.orgId) {
    return NextResponse.json({ error: "Yetkiniz yok" }, { status: 403 });
  }

  if (d.targetTCO2e === null) {
    await prisma.target.deleteMany({ where: { orgId: d.orgId, year: d.year } });
    await audit(session.sub, "HEDEF_SIL", "Target", null, `${d.year}`);
  } else {
    await prisma.target.upsert({
      where: { orgId_year: { orgId: d.orgId, year: d.year } },
      create: { orgId: d.orgId, year: d.year, targetTCO2e: d.targetTCO2e },
      update: { targetTCO2e: d.targetTCO2e },
    });
    await audit(session.sub, "HEDEF_KAYDET", "Target", null, `${d.year}=${d.targetTCO2e}`);
  }
  return NextResponse.json({ ok: true });
}
