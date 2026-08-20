import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiSession, apiOrgId } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { BANKA_GORUNUM_ROLLER, BANKA_YONETIM_ROLLER } from "@/lib/yetki";
import { gecisIzinliMi, GECIS_AUDIT } from "@/lib/kredi";
import type { CreditStatus } from "@/lib/constants";

/* ── kredi talepleri (banka tarafı): bekleyenleri listele, onayla/reddet ── */

/** GET — bankaya gelen işlemler (varsayılan: bekleyen talepler; ?hepsi=1 → tümü) */
export async function GET(req: Request) {
  const s = await apiSession(BANKA_GORUNUM_ROLLER);
  if (!s) return NextResponse.json({ error: "Yetkiniz yok" }, { status: 403 });
  const orgId = await apiOrgId(s);
  if (!orgId) return NextResponse.json({ error: "Kurum bulunamadı" }, { status: 400 });
  const org = await prisma.organization.findUnique({ where: { id: orgId }, select: { type: true } });
  if (org?.type !== "KARBON_BANK") return NextResponse.json({ error: "Bu uç yalnız karbon bankası kurumları içindir" }, { status: 403 });

  const hepsi = new URL(req.url).searchParams.get("hepsi") === "1";
  const txs = await prisma.creditTransaction.findMany({
    where: { bankOrgId: orgId, ...(hepsi ? {} : { status: "TALEP" }) },
    include: {
      pool: { select: { projectName: true, standard: true, vintageYear: true, availableTCO2e: true } },
      buyerOrg: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  return NextResponse.json({ islemler: txs });
}

const kararSchema = z.object({
  id: z.string().min(1),
  karar: z.enum(["BANKA_ONAY", "RED"]),
  decisionNote: z.string().max(300).optional(),
});

/** PATCH — talebi onayla ya da reddet (durum makinesi: TALEP → BANKA_ONAY | RED). */
export async function PATCH(req: Request) {
  const s = await apiSession(BANKA_YONETIM_ROLLER);
  if (!s) return NextResponse.json({ error: "Yetkiniz yok" }, { status: 403 });
  const orgId = await apiOrgId(s);
  if (!orgId) return NextResponse.json({ error: "Kurum bulunamadı" }, { status: 400 });
  const org = await prisma.organization.findUnique({ where: { id: orgId }, select: { type: true, name: true } });
  if (org?.type !== "KARBON_BANK") return NextResponse.json({ error: "Bu uç yalnız karbon bankası kurumları içindir" }, { status: 403 });

  const parsed = kararSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Geçersiz veri" }, { status: 400 });
  const d = parsed.data;

  const tx = await prisma.creditTransaction.findUnique({
    where: { id: d.id },
    include: { pool: { select: { projectName: true, availableTCO2e: true } }, buyerOrg: { select: { name: true } } },
  });
  if (!tx || tx.bankOrgId !== orgId) return NextResponse.json({ error: "İşlem bulunamadı" }, { status: 404 });
  if (!gecisIzinliMi(tx.status as CreditStatus, d.karar, "BANKA"))
    return NextResponse.json({ error: `"${tx.status}" durumundaki işlem için bu karar verilemez` }, { status: 409 });

  // onayda havuz bakiyesi hâlâ yeterli mi? (rezervasyon transferde düşülür — burada ön kontrol)
  if (d.karar === "BANKA_ONAY" && tx.pool.availableTCO2e < tx.amountTCO2e)
    return NextResponse.json({ error: `Havuz bakiyesi yetersiz (kalan ${tx.pool.availableTCO2e} tCO₂e)` }, { status: 409 });

  await prisma.creditTransaction.update({
    where: { id: d.id },
    data: { status: d.karar, decisionNote: d.decisionNote ?? null, approvedById: s.sub },
  });
  await audit(
    s.sub, GECIS_AUDIT[d.karar], "CreditTransaction", d.id,
    `${tx.buyerOrg.name} · ${tx.pool.projectName} · ${tx.amountTCO2e} tCO₂e${d.decisionNote ? ` · ${d.decisionNote}` : ""}`,
    s.email
  );
  return NextResponse.json({ ok: true });
}
