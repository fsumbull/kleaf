import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiSession } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { KLEAF_DENETCI_ROLLER } from "@/lib/yetki";
import { evaluateTransactionFlags } from "@/lib/compliance";

/** Tarama — POST /api/tara — tüm TRANSFER işlemlerini uyum motorundan geçirir. */
export async function POST(_req: Request) {
  const s = await apiSession(KLEAF_DENETCI_ROLLER);
  if (!s) return NextResponse.json({ error: "Yetkiniz yok" }, { status: 403 });

  const txs = await prisma.creditTransaction.findMany({
    where: { status: { in: ["TRANSFER", "DENETIM_ASKI"] } },
    select: { id: true, poolId: true, buyerOrgId: true, amountTCO2e: true, priceTRYPerTon: true },
  });

  let yeniBayrak = 0;
  for (const tx of txs) {
    // aynı türden açık bayrak varsa çift oluşturma — mevcut açıkları koru
    const varOlan = await prisma.complianceFlag.findMany({
      where: { transactionId: tx.id, durum: "ACIK" }, select: { tur: true },
    });
    const varOlanTurler = new Set(varOlan.map((v) => v.tur));
    const flags = await evaluateTransactionFlags(
      { txId: tx.id, poolId: tx.poolId, buyerOrgId: tx.buyerOrgId, amountTCO2e: tx.amountTCO2e, priceTRYPerTon: tx.priceTRYPerTon },
      prisma
    );
    const yeniler = flags.filter((f) => !varOlanTurler.has(f.tur));
    if (yeniler.length > 0) {
      await prisma.complianceFlag.createMany({
        data: yeniler.map((f) => ({ transactionId: tx.id, orgId: tx.buyerOrgId, tur: f.tur, onem: f.onem, aciklama: f.aciklama })),
      });
      yeniBayrak += yeniler.length;
    }
  }

  await audit(s.sub, "DENETIM_TOPLU_TARAMA", "System", null, `${txs.length} işlem tarandı; ${yeniBayrak} yeni bayrak`, s.email);
  return NextResponse.json({ ok: true, taranan: txs.length, yeniBayrak });
}
