import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiSession, apiOrgId } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { KREDI_TALEP_ROLLER } from "@/lib/yetki";
import { gecisIzinliMi, GECIS_AUDIT, cuzdanBakiyesi } from "@/lib/kredi";
import { evaluateTransactionFlags } from "@/lib/compliance";
import type { CreditStatus } from "@/lib/constants";

/* ── karbon kredisi (belediye tarafı): vitrin, cüzdan, talep, transfer, iptal ── */

/** GET — aktif havuz vitrini + kurumun işlemleri + cüzdan bakiyesi */
export async function GET() {
  const s = await apiSession();
  if (!s) return NextResponse.json({ error: "Oturum gerekli" }, { status: 401 });
  const orgId = await apiOrgId(s);
  if (!orgId) return NextResponse.json({ error: "Kurum bulunamadı" }, { status: 400 });

  const [havuzlar, islemler, mahsuplar] = await Promise.all([
    prisma.creditPool.findMany({
      where: { active: true, availableTCO2e: { gt: 0 } },
      include: { bankOrg: { select: { name: true } } },
      orderBy: { priceTRYPerTon: "asc" },
    }),
    prisma.creditTransaction.findMany({
      where: { buyerOrgId: orgId },
      include: {
        pool: { select: { projectName: true, standard: true, vintageYear: true } },
        bankOrg: { select: { name: true } },
        retirements: { select: { amountTCO2e: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    prisma.creditRetirement.findMany({ where: { orgId }, orderBy: { createdAt: "desc" }, take: 200 }),
  ]);

  const cuzdan = cuzdanBakiyesi(
    islemler.map((t) => ({ status: t.status, amountTCO2e: t.amountTCO2e })),
    mahsuplar.map((m) => ({ amountTCO2e: m.amountTCO2e }))
  );
  return NextResponse.json({ havuzlar, islemler, mahsuplar, cuzdan });
}

const talepSchema = z.object({
  poolId: z.string().min(1),
  amountTCO2e: z.number().positive("Miktar pozitif olmalı"),
  requestNote: z.string().max(300).optional(),
});

/** POST — havuzdan kredi talebi oluşturur (TALEP durumunda başlar, fiyat anlık kopyalanır). */
export async function POST(req: Request) {
  const s = await apiSession(KREDI_TALEP_ROLLER);
  if (!s) return NextResponse.json({ error: "Yetkiniz yok" }, { status: 403 });
  const orgId = await apiOrgId(s);
  if (!orgId) return NextResponse.json({ error: "Kurum bulunamadı" }, { status: 400 });
  const org = await prisma.organization.findUnique({ where: { id: orgId }, select: { type: true, name: true } });
  if (org?.type !== "BELEDIYE") return NextResponse.json({ error: "Kredi talebini yalnız belediye kurumları oluşturabilir" }, { status: 403 });

  const parsed = talepSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Geçersiz veri" }, { status: 400 });
  const d = parsed.data;

  const pool = await prisma.creditPool.findUnique({ where: { id: d.poolId }, include: { bankOrg: { select: { name: true } } } });
  if (!pool || !pool.active) return NextResponse.json({ error: "Havuz bulunamadı ya da vitrinde değil" }, { status: 404 });
  if (pool.availableTCO2e < d.amountTCO2e)
    return NextResponse.json({ error: `Havuz bakiyesi yetersiz (kalan ${pool.availableTCO2e} tCO₂e)` }, { status: 409 });

  const tx = await prisma.creditTransaction.create({
    data: {
      poolId: pool.id, bankOrgId: pool.bankOrgId, buyerOrgId: orgId,
      amountTCO2e: d.amountTCO2e, priceTRYPerTon: pool.priceTRYPerTon,
      requestNote: d.requestNote ?? null, requestedById: s.sub,
    },
  });
  await audit(
    s.sub, "KREDI_TALEP", "CreditTransaction", tx.id,
    `${pool.bankOrg.name} · ${pool.projectName} · ${d.amountTCO2e} tCO₂e · ${pool.priceTRYPerTon} ₺/t`,
    s.email
  );
  return NextResponse.json({ ok: true, id: tx.id }, { status: 201 });
}

const islemSchema = z.object({
  id: z.string().min(1),
  islem: z.enum(["TRANSFER", "IPTAL"]),
});

/** PATCH — belediye tarafı geçişleri: onaylı işlemi transfer et ya da talebi iptal et.
 *  Transfer atomiktir: havuz bakiyesi işlem içinde yeniden doğrulanıp düşülür. */
export async function PATCH(req: Request) {
  const s = await apiSession(KREDI_TALEP_ROLLER);
  if (!s) return NextResponse.json({ error: "Yetkiniz yok" }, { status: 403 });
  const orgId = await apiOrgId(s);
  if (!orgId) return NextResponse.json({ error: "Kurum bulunamadı" }, { status: 400 });

  const parsed = islemSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Geçersiz veri" }, { status: 400 });
  const d = parsed.data;

  const tx = await prisma.creditTransaction.findUnique({
    where: { id: d.id },
    include: { pool: { select: { projectName: true } }, bankOrg: { select: { name: true } } },
  });
  if (!tx || tx.buyerOrgId !== orgId) return NextResponse.json({ error: "İşlem bulunamadı" }, { status: 404 });
  if (!gecisIzinliMi(tx.status as CreditStatus, d.islem, "BELEDIYE"))
    return NextResponse.json({ error: `"${tx.status}" durumundaki işlem için bu adım uygulanamaz` }, { status: 409 });

  if (d.islem === "TRANSFER") {
    try {
      await prisma.$transaction(async (p) => {
        // bakiyeyi kilitli düş: koşullu güncelleme başka transferle yarışı engeller
        const upd = await p.creditPool.updateMany({
          where: { id: tx.poolId, availableTCO2e: { gte: tx.amountTCO2e } },
          data: { availableTCO2e: { decrement: tx.amountTCO2e } },
        });
        if (upd.count === 0) throw new Error("BAKIYE_YETERSIZ");
        await p.creditTransaction.update({ where: { id: tx.id }, data: { status: "TRANSFER" } });
      });
    } catch (e) {
      if (e instanceof Error && e.message === "BAKIYE_YETERSIZ")
        return NextResponse.json({ error: "Havuz bakiyesi transfer için yetersiz — bankayla iletişime geçin" }, { status: 409 });
      throw e;
    }

    // TRANSFER sonrası uyum motoru — bayrak varsa ComplianceFlag kayıtları oluştur
    try {
      const flags = await evaluateTransactionFlags(
        { txId: tx.id, poolId: tx.poolId, buyerOrgId: tx.buyerOrgId, amountTCO2e: tx.amountTCO2e, priceTRYPerTon: tx.priceTRYPerTon },
        prisma
      );
      if (flags.length > 0) {
        await prisma.complianceFlag.createMany({
          data: flags.map((f) => ({
            transactionId: tx.id, orgId: tx.buyerOrgId,
            tur: f.tur, onem: f.onem, aciklama: f.aciklama,
          })),
        });
      }
    } catch (err) {
      // uyum motoru işlemi bloklamaz — sadece log
      console.error("[compliance] evaluateTransactionFlags failed:", err);
    }
  } else {
    await prisma.creditTransaction.update({ where: { id: tx.id }, data: { status: "IPTAL" } });
  }

  await audit(
    s.sub, GECIS_AUDIT[d.islem], "CreditTransaction", tx.id,
    `${tx.bankOrg.name} · ${tx.pool.projectName} · ${tx.amountTCO2e} tCO₂e · ${tx.priceTRYPerTon} ₺/t`,
    s.email
  );
  return NextResponse.json({ ok: true });
}
