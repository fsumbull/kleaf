/* Karbon kredisi — havuz vitrini, kredi cüzdanı, mahsup ve net emisyon (belediye) */
import { redirect } from "next/navigation";
import { getScope } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getEmissionRows } from "@/lib/data";
import { yearScopeTotals } from "@/lib/carbon/engine";
import { KREDI_TALEP_ROLLER } from "@/lib/yetki";
import { cuzdanBakiyesi } from "@/lib/kredi";
import { fmtTons, fmt1 } from "@/lib/format";
import { PageHeader, KpiCard } from "@/components/ui";
import { KrediPaneli } from "@/components/kredi-client";

export default async function KarbonKrediPage() {
  const { session, org, year } = await getScope();
  if (org.type !== "BELEDIYE") redirect("/");
  const canRequest = (KREDI_TALEP_ROLLER as readonly string[]).includes(session.role);

  const [havuzlar, islemler, mahsuplar, rows] = await Promise.all([
    prisma.creditPool.findMany({
      where: { active: true, availableTCO2e: { gt: 0 } },
      include: { bankOrg: { select: { name: true } } },
      orderBy: { priceTRYPerTon: "asc" },
    }),
    prisma.creditTransaction.findMany({
      where: { buyerOrgId: org.id },
      include: {
        pool: { select: { projectName: true, standard: true, vintageYear: true } },
        bankOrg: { select: { name: true } },
        retirements: { select: { amountTCO2e: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.creditRetirement.findMany({ where: { orgId: org.id } }),
    getEmissionRows(org.id),
  ]);

  const cuzdan = cuzdanBakiyesi(
    islemler.map((t) => ({ status: t.status, amountTCO2e: t.amountTCO2e })),
    mahsuplar.map((m) => ({ amountTCO2e: m.amountTCO2e }))
  );
  const brut = yearScopeTotals(rows, year).total;
  const yilMahsup = mahsuplar.filter((m) => m.year === year).reduce((a, m) => a + m.amountTCO2e, 0);
  const net = Math.max(0, brut - yilMahsup);

  return (
    <>
      <PageHeader
        eyebrow="karbonbank"
        title="Karbon kredisi"
        desc={`${org.name} · sertifikalı kredi havuzlarından edinim, cüzdan ve envanter mahsubu`}
      />
      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label={`${year} brüt emisyon`} value={fmtTons(brut)} unit="tCO₂e" hint="onaylı kayıtlardan" />
        <KpiCard label={`${year} mahsup`} value={fmt1(yilMahsup)} unit="tCO₂e" hint="emekliye ayrılan kredi" tone="warm" />
        <KpiCard label={`${year} net emisyon`} value={fmtTons(net)} unit="tCO₂e" hint="brüt − mahsup" />
        <KpiCard label="cüzdan bakiyesi" value={fmt1(cuzdan.kalan)} unit="tCO₂e" hint={`${fmt1(cuzdan.edinilen)} edinildi · ${fmt1(cuzdan.mahsup)} mahsup`} />
      </div>
      <KrediPaneli
        havuzlar={havuzlar.map((h) => ({
          id: h.id, projectName: h.projectName, standard: h.standard, vintageYear: h.vintageYear,
          availableTCO2e: h.availableTCO2e, priceTRYPerTon: h.priceTRYPerTon, bankOrg: h.bankOrg.name,
        }))}
        islemler={islemler.map((t) => ({
          id: t.id, status: t.status, amountTCO2e: t.amountTCO2e, priceTRYPerTon: t.priceTRYPerTon,
          requestNote: t.requestNote, decisionNote: t.decisionNote, createdAt: t.createdAt.toISOString(),
          pool: { projectName: t.pool.projectName, standard: t.pool.standard, vintageYear: t.pool.vintageYear },
          bankOrg: t.bankOrg.name,
          mahsupEdilen: t.retirements.reduce((a, r) => a + r.amountTCO2e, 0),
        }))}
        canRequest={canRequest}
        year={year}
      />
    </>
  );
}
