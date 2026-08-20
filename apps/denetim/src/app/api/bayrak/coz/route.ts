import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiSession } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { KLEAF_DENETCI_ROLLER } from "@/lib/yetki";

/** Bayrak çözme — POST /api/bayrak/coz  Body: { id, cozumNotu } */
const bodySchema = z.object({
  id: z.string().min(1),
  cozumNotu: z.string().min(3).max(500),
});

export async function POST(req: Request) {
  const s = await apiSession(KLEAF_DENETCI_ROLLER);
  if (!s) return NextResponse.json({ error: "Yetkiniz yok" }, { status: 403 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Geçersiz veri" }, { status: 400 });
  const d = parsed.data;

  const flag = await prisma.complianceFlag.findUnique({ where: { id: d.id }, select: { id: true, tur: true, durum: true } });
  if (!flag) return NextResponse.json({ error: "Bayrak bulunamadı" }, { status: 404 });
  if (flag.durum === "COZULDU") return NextResponse.json({ error: "Bayrak zaten çözülmüş" }, { status: 409 });

  await prisma.complianceFlag.update({
    where: { id: flag.id },
    data: { durum: "COZULDU", cozumNotu: d.cozumNotu, cozenId: s.sub },
  });
  await audit(s.sub, "DENETIM_BAYRAK_COZ", "ComplianceFlag", flag.id, `${flag.tur} — ${d.cozumNotu}`, s.email);
  return NextResponse.json({ ok: true });
}
