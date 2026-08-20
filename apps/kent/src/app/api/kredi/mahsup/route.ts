import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiSession, apiOrgId } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { KREDI_TALEP_ROLLER } from "@/lib/yetki";
import { mahsupGecerliMi } from "@/lib/kredi";

/* ── kredi mahsubu: transfer edilmiş krediyi bir envanter yılına sayar ── */

const schema = z.object({
  transactionId: z.string().min(1),
  year: z.number().int().min(2000).max(2100),
  amountTCO2e: z.number().positive("Miktar pozitif olmalı"),
  note: z.string().max(300).optional(),
});

export async function POST(req: Request) {
  const s = await apiSession(KREDI_TALEP_ROLLER);
  if (!s) return NextResponse.json({ error: "Yetkiniz yok" }, { status: 403 });
  const orgId = await apiOrgId(s);
  if (!orgId) return NextResponse.json({ error: "Kurum bulunamadı" }, { status: 400 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Geçersiz veri" }, { status: 400 });
  const d = parsed.data;

  const tx = await prisma.creditTransaction.findUnique({
    where: { id: d.transactionId },
    include: { pool: { select: { projectName: true } }, retirements: { select: { amountTCO2e: true } } },
  });
  if (!tx || tx.buyerOrgId !== orgId) return NextResponse.json({ error: "İşlem bulunamadı" }, { status: 404 });
  if (tx.status !== "TRANSFER")
    return NextResponse.json({ error: "Yalnız transfer edilmiş krediler mahsup edilebilir" }, { status: 409 });

  const kontrol = mahsupGecerliMi(d.amountTCO2e, tx.amountTCO2e, tx.retirements);
  if (!kontrol.ok) return NextResponse.json({ error: kontrol.sebep }, { status: 409 });

  const ret = await prisma.creditRetirement.create({
    data: {
      orgId, transactionId: tx.id, year: d.year,
      amountTCO2e: d.amountTCO2e, note: d.note ?? null, createdById: s.sub,
    },
  });
  await audit(s.sub, "KREDI_MAHSUP", "CreditRetirement", ret.id, `${tx.pool.projectName} · ${d.amountTCO2e} tCO₂e → ${d.year} envanteri`, s.email);
  return NextResponse.json({ ok: true, id: ret.id }, { status: 201 });
}
