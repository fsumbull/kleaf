import { getScope } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader, KpiCard } from "@/components/ui";
import { KiyasClient, type KiyasRow } from "@/components/kiyas-client";
import { fmt1 } from "@/lib/format";

/** Belediye kıyaslama — platformdaki tüm belediyelerin yıllık performans karşılaştırması */
export default async function KiyasPage() {
  const { org, year } = await getScope();

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
        kendisi: b.id === org.id,
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

  const kendi = rows.find((r) => r.kendisi);
  const dolu = rows.filter((r) => r.kisiBasiKg !== null);
  const siraliKisiBasi = [...dolu].sort((a, b) => (a.kisiBasiKg ?? 0) - (b.kisiBasiKg ?? 0));
  const sira = kendi ? siraliKisiBasi.findIndex((r) => r.orgId === kendi.orgId) + 1 : 0;
  const ortalamaKisiBasi = dolu.length ? dolu.reduce((a, r) => a + (r.kisiBasiKg ?? 0), 0) / dolu.length : 0;

  return (
    <>
      <PageHeader
        eyebrow="kıyaslama"
        title="Belediyeler arası karşılaştırma"
        desc={`${year} kurumsal envanter · platformdaki ${rows.length} belediye — kişi başı emisyon, onay ve belge oranları`}
      />
      <div className="rise-1 mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="sıralamanız (kişi başı)" value={sira > 0 ? `${sira} / ${siraliKisiBasi.length}` : "—"}
          hint="düşük kişi başı emisyon = üst sıra" />
        <KpiCard label="kişi başı emisyonunuz" value={kendi?.kisiBasiKg != null ? fmt1(kendi.kisiBasiKg) : "—"} unit="kg CO₂e"
          hint={`platform ortalaması ${fmt1(ortalamaKisiBasi)} kg`} tone={kendi?.kisiBasiKg != null && kendi.kisiBasiKg <= ortalamaKisiBasi ? "leaf" : "warm"} />
        <KpiCard label="onay oranınız" value={kendi?.onayOranPct != null ? fmt1(kendi.onayOranPct) : "—"} unit="%" hint="onaylı kayıt / tüm kayıtlar" />
        <KpiCard label="belge oranınız" value={kendi?.belgeOranPct != null ? fmt1(kendi.belgeOranPct) : "—"} unit="%" hint="kanıt belgeli kayıt payı" />
      </div>
      <KiyasClient rows={rows} year={year} />
    </>
  );
}
