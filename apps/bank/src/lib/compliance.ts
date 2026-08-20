/**
 * Uyum motoru — bir kredi işlemi (CreditTransaction) için otomatik bayrak üretir.
 *
 * Kurallar (kısa):
 *  - BRUT_ASIM (YUKSEK): Alıcı kurumun bu yıl mahsup ettiği toplam kredi > o yılın brüt emisyonu.
 *      Not: brüt = tüm scope EmissionRecord toplamı; Scope 2 negatif değerler 0'a kırpılır.
 *  - BUFFER_ALTI (YUKSEK): Transfer sonrası havuzun kalan bakiyesi bufferPct'in altına düşerse.
 *  - CIFTE_SAYIM (YUKSEK): Aynı transactionId için 2+ CreditRetirement veya aynı işlemin 2+ TRANSFER'i.
 *  - FIYAT_ANOMALI (ORTA): İşlem fiyatı, aynı standart-vintage havuz medyanından ±3σ dışında.
 *  - ASIRI_YOGUNLASMA (DUSUK): Alıcının toplam retirement'ının %40'ından fazlası tek havuzdan.
 */

import type { PrismaClient } from "@prisma/client";

export type FlagInput = { tur: string; onem: "DUSUK" | "ORTA" | "YUKSEK"; aciklama: string };

interface EvalContext {
  txId: string;
  poolId: string;
  buyerOrgId: string;
  amountTCO2e: number;
  priceTRYPerTon: number;
  vintageYear?: number;
}

/**
 * İşlemi değerlendirir; ilgili bayrakları döndürür.
 * DB'ye YAZMAZ — çağıran ComplianceFlag.createMany ile persist eder.
 */
export async function evaluateTransactionFlags(
  ctx: EvalContext,
  prisma: PrismaClient
): Promise<FlagInput[]> {
  const flags: FlagInput[] = [];
  const yil = new Date().getFullYear();

  // Havuz bilgisi
  const pool = await prisma.creditPool.findUnique({
    where: { id: ctx.poolId },
    select: { totalTCO2e: true, availableTCO2e: true, bufferPct: true, priceTRYPerTon: true, standard: true, projectName: true, projectType: true, vintageYear: true },
  });
  if (!pool) return flags;

  // ── BUFFER_ALTI: transfer sonrası kalan / toplam < bufferPct%
  const kalan = pool.availableTCO2e;
  const bufferOran = pool.bufferPct / 100;
  if (pool.totalTCO2e > 0 && kalan / pool.totalTCO2e < bufferOran) {
    flags.push({
      tur: "BUFFER_ALTI",
      onem: "YUKSEK",
      aciklama: `Havuz "${pool.projectName}" bakiyesi buffer eşiği %${pool.bufferPct} altında (kalan ${kalan.toFixed(0)} / toplam ${pool.totalTCO2e.toFixed(0)} tCO₂e).`,
    });
  }

  // ── FIYAT_ANOMALI: aynı standart+vintage havuz fiyatlarına göre 3σ
  const benzerHavuzlar = await prisma.creditPool.findMany({
    where: { standard: pool.standard, vintageYear: pool.vintageYear, active: true },
    select: { priceTRYPerTon: true },
  });
  if (benzerHavuzlar.length >= 3) {
    const fiyatlar = benzerHavuzlar.map((p) => p.priceTRYPerTon);
    const ort = fiyatlar.reduce((a, x) => a + x, 0) / fiyatlar.length;
    const varyans = fiyatlar.reduce((a, x) => a + (x - ort) ** 2, 0) / fiyatlar.length;
    const std = Math.sqrt(varyans);
    if (std > 0 && Math.abs(ctx.priceTRYPerTon - ort) > 3 * std) {
      flags.push({
        tur: "FIYAT_ANOMALI",
        onem: "ORTA",
        aciklama: `Fiyat ${ctx.priceTRYPerTon} ₺/t, ${pool.standard} ${pool.vintageYear} ortalamasından (${ort.toFixed(0)} ₺/t, σ=${std.toFixed(0)}) 3σ dışında.`,
      });
    }
  }

  // ── ASIRI_YOGUNLASMA: alıcının toplam mahsupundaki bu havuz payı %40+
  const alicRetires = await prisma.creditRetirement.findMany({
    where: { orgId: ctx.buyerOrgId },
    include: { transaction: { select: { poolId: true } } },
  });
  const toplamMahsup = alicRetires.reduce((a, r) => a + r.amountTCO2e, 0);
  if (toplamMahsup > 0) {
    const buHavuzMahsup = alicRetires
      .filter((r) => r.transaction.poolId === ctx.poolId)
      .reduce((a, r) => a + r.amountTCO2e, 0);
    const oran = (buHavuzMahsup + ctx.amountTCO2e) / (toplamMahsup + ctx.amountTCO2e);
    if (oran > 0.4) {
      flags.push({
        tur: "ASIRI_YOGUNLASMA",
        onem: "DUSUK",
        aciklama: `Alıcının portföyünün %${(oran * 100).toFixed(0)}'ı tek havuzda ("${pool.projectName}") yoğunlaşıyor.`,
      });
    }
  }

  // ── BRUT_ASIM: alıcının bu yıl toplam mahsup + bu tx > yıl brüt emisyonu
  const bruEmisyonRows = await prisma.emissionRecord.findMany({
    where: { activityData: { facility: { orgId: ctx.buyerOrgId }, year: yil } },
    select: { scope: true, tCO2e: true },
  });
  const bruEmisyon = bruEmisyonRows.reduce((a, r) => a + (r.scope === 2 ? Math.max(0, r.tCO2e) : r.tCO2e), 0);
  const yilMahsup = alicRetires.filter((r) => r.year === yil).reduce((a, r) => a + r.amountTCO2e, 0);
  if (bruEmisyon > 0 && yilMahsup + ctx.amountTCO2e > bruEmisyon) {
    flags.push({
      tur: "BRUT_ASIM",
      onem: "YUKSEK",
      aciklama: `Alıcının ${yil} yılı brüt emisyonu ${bruEmisyon.toFixed(0)} tCO₂e; toplam mahsup ${(yilMahsup + ctx.amountTCO2e).toFixed(0)} tCO₂e — greenwash riski.`,
    });
  }

  // ── CIFTE_SAYIM: aynı transactionId için 2+ retirement (aynı krediyi iki yıla saymak)
  const txRetirements = await prisma.creditRetirement.count({ where: { transactionId: ctx.txId } });
  if (txRetirements >= 2) {
    flags.push({
      tur: "CIFTE_SAYIM",
      onem: "YUKSEK",
      aciklama: `Bu işlem için ${txRetirements} mahsup kaydı bulunuyor — aynı kredinin birden fazla yıla sayılması riski.`,
    });
  }

  return flags;
}

/** Bir işlem için mevcut açık bayrakları kapatır ve yeniden değerlendirir. */
export async function reevaluateTransaction(txId: string, prisma: PrismaClient) {
  const tx = await prisma.creditTransaction.findUnique({
    where: { id: txId },
    select: { id: true, poolId: true, buyerOrgId: true, amountTCO2e: true, priceTRYPerTon: true },
  });
  if (!tx) return { yeniBayrak: 0 };
  await prisma.complianceFlag.updateMany({
    where: { transactionId: txId, durum: "ACIK" },
    data: { durum: "COZULDU", cozumNotu: "Otomatik: yeniden değerlendirme sırasında koşul geçerliliğini yitirdi." },
  });
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
  return { yeniBayrak: flags.length };
}
