import { getScope } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getEmissionRows, resolveFactor } from "@/lib/data";
import { totalsByYear, yearScopeTotals, totalsByCategory, type ScenarioContext } from "@/lib/carbon/engine";
import { PageHeader } from "@/components/ui";
import { SenaryoClient, type SavedScenario } from "@/components/senaryo-client";
import type { ScenarioParams } from "@/lib/carbon/engine";

export default async function SenaryolarPage() {
  const { session, org, year } = await getScope();

  const [rows, scenarios, elektrikFaktor, gazFaktor, dizelFaktor, orgRow] = await Promise.all([
    getEmissionRows(org.id),
    prisma.scenario.findMany({ where: { orgId: org.id }, orderBy: { createdAt: "desc" } }),
    resolveFactor(org.id, "ELEKTRIK"),
    resolveFactor(org.id, "DOGALGAZ"),
    resolveFactor(org.id, "DIZEL"),
    prisma.organization.findUniqueOrThrow({
      where: { id: org.id },
      select: { elektrikTRYPerKwh: true, dogalgazTRYPerM3: true, dizelTRYPerL: true, atikBertarafTRYPerTon: true, gesKwhPerKwp: true },
    }),
  ]);

  // referans yıl: seçili yıl verisi varsa o, yoksa en son dolu yıl
  const yearTotals = totalsByYear(rows);
  const refYear = (yearScopeTotals(rows, year).total > 0)
    ? year
    : [...yearTotals.entries()].filter(([, v]) => v > 0).sort((a, b) => b[0] - a[0])[0]?.[0] ?? year;

  const refRows = rows.filter((r) => r.year === refYear);
  /* kısmi yıl yıllıklandırma: referans yılda n<12 ay veri varsa taban değerler ×12/n ölçeklenir */
  const refMonths = new Set(refRows.map((r) => r.month)).size;
  const annualK = refMonths > 0 && refMonths < 12 ? 12 / refMonths : 1;
  const byCat = totalsByCategory(refRows);
  const sum = (...cats: string[]) => annualK * cats.reduce((s, c) => s + Math.max(0, byCat.get(c as never) ?? 0), 0);

  const [atikTon, aydinlatma] = await Promise.all([
    prisma.activityData.aggregate({
      where: { facility: { orgId: org.id }, category: "ATIK", year: refYear },
      _sum: { amount: true },
    }),
    prisma.activityData.aggregate({
      where: { facility: { orgId: org.id, type: "AYDINLATMA" }, category: "ELEKTRIK", year: refYear },
      _sum: { amount: true },
    }),
  ]);

  const ctx: ScenarioContext = {
    elektrikFaktoru: elektrikFaktor?.kgCO2ePerUnit ?? 0.442,
    filoTCO2e: sum("DIZEL", "BENZIN", "LPG", "CNG", "ARAC_KM"),
    binaEnerjiTCO2e: sum("ELEKTRIK", "DOGALGAZ"),
    aydinlatmaKwh: (aydinlatma._sum.amount ?? 0) * annualK,
    dogalgazTCO2e: sum("DOGALGAZ"),
    atikTon: (atikTon._sum.amount ?? 0) * annualK,
    elektrikFiyatiTRY: orgRow.elektrikTRYPerKwh,
    dogalgazFiyatiTRY: orgRow.dogalgazTRYPerM3,
    dizelFiyatiTRY: orgRow.dizelTRYPerL,
    atikBertarafTRY: orgRow.atikBertarafTRYPerTon,
    dogalgazFaktoru: gazFaktor?.kgCO2ePerUnit ?? 2.02,
    dizelFaktoru: dizelFaktor?.kgCO2ePerUnit ?? 2.68,
    gesKwhPerKwp: orgRow.gesKwhPerKwp,
  };

  const baselineTotal = yearScopeTotals(rows, org.baselineYear).total || yearTotals.get(refYear) || 0;

  const saved: SavedScenario[] = scenarios.map((s) => {
    let params: ScenarioParams = { gesKwp: 0, filoElektrifikasyonPct: 0, binaVerimlilikPct: 0 };
    try { params = { ...params, ...JSON.parse(s.params) }; } catch { /* bozuk kayıt görmezden gelinir */ }
    return { id: s.id, name: s.name, params };
  });

  return (
    <>
      <PageHeader
        eyebrow="senaryolar"
        title="Net-sıfır senaryo stüdyosu"
        desc={`GES, filo elektrifikasyonu ve bina verimliliği kaldıraçlarıyla ${org.netZeroYear} hedefini test edin · referans yıl ${refYear}${annualK > 1 ? ` — ${refMonths} aylık veri yıllıklandırıldı (×12/${refMonths})` : ""}`}
      />
      <SenaryoClient
        orgId={org.id}
        baselineYear={org.baselineYear}
        netZeroYear={org.netZeroYear}
        baselineTotal={baselineTotal}
        yearTotals={[...yearTotals.entries()]}
        ctx={ctx}
        saved={saved}
        canSave={["SUPER_ADMIN", "IKLIM_MERKEZI", "MALI_HIZMETLER", "ENERJI_YONETICISI"].includes(session.role)}
        currentYear={refYear}
      />
    </>
  );
}
