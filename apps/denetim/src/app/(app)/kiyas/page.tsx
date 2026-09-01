import { getScope } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader, Card, EmptyState, KpiCard } from "@/components/ui";
import { KiyasClient, type KiyasRow } from "@/components/kiyas-client";
import { fmt1, fmtTons } from "@/lib/format";

/** Ulusal belediye kıyaslama — düzenleyici perspektifinden tüm belediyelerin karşılaştırması */
export default async function KiyasPage() {
  const { org, year } = await getScope();
  if (org.type !== "KLEAF") return <Card><EmptyState title="Yalnız KLEAF org tipi" desc="" /></Card>;

  const belediyeler = await prisma.organization.findMany({
    where: { type: "BELEDIYE" },
    select: { id: true, name: true, netZeroYear: true },
    orderBy: { name: "asc" },
  });

  const rows: KiyasRow[] = await Promise.all(
    belediyeler.map(async (b): Promise<KiyasRow> => {
      const [net, brut, kayitToplam, kayitOnayli, kayitBelgeli, nufusAgg, mahsupAgg] = await Promise.all([
        prisma.emissionRecord.aggregate({
          _sum: { tCO2e: true },
          where: { activityData: { year, status: "ONAYLI", facility: { orgId: b.id } } },
        }),
        prisma.emissionRecord.aggregate({
          _sum: { tCO2e: true },
          where: { tCO2e: { gt: 0 }, activityData: { year, status: "ONAYLI", facility: { orgId: b.id } } },
        }),
        prisma.activityData.count({ where: { year, facility: { orgId: b.id } } }),
        prisma.activityData.count({ where: { year, status: "ONAYLI", facility: { orgId: b.id } } }),
        prisma.activityData.count({
          where: { year, facility: { orgId: b.id }, OR: [{ documentRef: { not: null } }, { documents: { some: {} } }] },
        }),
        prisma.neighborhood.aggregate({ _sum: { population: true }, where: { orgId: b.id } }),
        prisma.creditRetirement.aggregate({ _sum: { amountTCO2e: true }, where: { orgId: b.id, year } }),
      ]);
      const netT = net._sum.tCO2e ?? 0;
      const nufus = nufusAgg._sum.population ?? 0;
      return {
        orgId: b.id,
        name: b.name,
        kendisi: false,
        netZeroYear: b.netZeroYear,
        netTCO2e: netT,
        brutTCO2e: brut._sum.tCO2e ?? 0,
        nufus,
        kisiBasiKg: nufus > 0 ? (netT * 1000) / nufus : null,
        onayOranPct: kayitToplam > 0 ? (kayitOnayli / kayitToplam) * 100 : null,
        belgeOranPct: kayitToplam > 0 ? (kayitBelgeli / kayitToplam) * 100 : null,
        mahsupTCO2e: mahsupAgg._sum.amountTCO2e ?? 0,
      };
    }),
  );

  const dolu = rows.filter((r) => r.kisiBasiKg !== null);
  const enIyi = dolu.length ? dolu.reduce((a, r) => ((r.kisiBasiKg ?? 0) < (a.kisiBasiKg ?? 0) ? r : a)) : null;
  const ortOnay = rows.filter((r) => r.onayOranPct !== null);
  const ortalamaOnay = ortOnay.length ? ortOnay.reduce((a, r) => a + (r.onayOranPct ?? 0), 0) / ortOnay.length : 0;
  const toplamNet = rows.reduce((a, r) => a + r.netTCO2e, 0);
  const toplamMahsup = rows.reduce((a, r) => a + r.mahsupTCO2e, 0);

  return (
    <>
      <PageHeader
        eyebrow="ulusal kıyaslama"
        title="Belediyeler arası karşılaştırma"
        desc={`${year} kurumsal envanter · platformdaki ${rows.length} belediye — kişi başı emisyon, onay ve belge oranları`}
      />
      <div className="rise-1 mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="toplam kurumsal net" value={fmtTons(toplamNet)} unit="tCO₂e" hint={`${rows.length} belediye toplamı`} />
        <KpiCard label="en düşük kişi başı" value={enIyi?.kisiBasiKg != null ? fmt1(enIyi.kisiBasiKg) : "—"} unit="kg CO₂e"
          hint={enIyi?.name ?? "—"} tone="leaf" />
        <KpiCard label="ortalama onay oranı" value={fmt1(ortalamaOnay)} unit="%" hint="tüm belediyeler" />
        <KpiCard label="toplam mahsup" value={fmtTons(toplamMahsup)} unit="tCO₂e" hint="kredi emeklilikleri" tone="warm" />
      </div>
      <KiyasClient rows={rows} year={year} />
    </>
  );
}
