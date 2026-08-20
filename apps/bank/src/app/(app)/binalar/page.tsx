/* Binalar — enerji yoğunluğu, kWh eşdeğeri karşılaştırma, tasarruf hedefi */
import { getScope } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { kwhEquivalent } from "@/lib/carbon/engine";
import { PageHeader } from "@/components/ui";
import { BinalarClient, type BinaRow } from "@/components/binalar-client";

const ENERGY_CATS = ["ELEKTRIK", "DOGALGAZ", "KOMUR"] as const;
const BUILDING_TYPES = ["BINA", "KAMPUS", "TESIS"] as const;

export default async function BinalarPage() {
  const { org, year, birim } = await getScope();
  const bu = birim.unitId;

  const [buildings, records, orgRow] = await Promise.all([
    prisma.facility.findMany({
      where: { orgId: org.id, type: { in: [...BUILDING_TYPES] }, ...(bu ? { unitId: bu } : {}) },
      select: { id: true, name: true, type: true, areaM2: true, staffCount: true },
      orderBy: { name: "asc" },
    }),
    prisma.activityData.findMany({
      where: {
        facility: { orgId: org.id, type: { in: [...BUILDING_TYPES] }, ...(bu ? { unitId: bu } : {}) },
        category: { in: [...ENERGY_CATS] },
        year: { in: [year, org.baselineYear] },
      },
      select: { facilityId: true, category: true, year: true, amount: true, emissionRecord: { select: { tCO2e: true } } },
    }),
    prisma.organization.findUniqueOrThrow({
      where: { id: org.id },
      select: { enerjiTasarrufHedefiPct: true },
    }),
  ]);

  type Acc = { elektrikKwh: number; dogalgazM3: number; komurKg: number; tCO2e: number };
  const cur = new Map<string, Acc>();
  const baz = new Map<string, Acc>();
  for (const r of records) {
    const target = r.year === year ? cur : r.year === org.baselineYear ? baz : null;
    if (!target) continue;
    const a = target.get(r.facilityId) ?? { elektrikKwh: 0, dogalgazM3: 0, komurKg: 0, tCO2e: 0 };
    if (r.category === "ELEKTRIK") a.elektrikKwh += r.amount;
    else if (r.category === "DOGALGAZ") a.dogalgazM3 += r.amount;
    else a.komurKg += r.amount;
    if (r.year === year) a.tCO2e += r.emissionRecord?.tCO2e ?? 0;
    target.set(r.facilityId, a);
  }

  const rows: BinaRow[] = buildings.map((b) => {
    const c = cur.get(b.id);
    const bz = baz.get(b.id);
    return {
      id: b.id,
      name: b.name,
      type: b.type,
      areaM2: b.areaM2,
      staffCount: b.staffCount,
      elektrikKwh: c?.elektrikKwh ?? 0,
      dogalgazM3: c?.dogalgazM3 ?? 0,
      kwhEq: c ? kwhEquivalent({ elektrikKwh: c.elektrikKwh, dogalgazM3: c.dogalgazM3, komurKg: c.komurKg }) : 0,
      tCO2e: c?.tCO2e ?? 0,
      bazKwhEq: bz && year !== org.baselineYear
        ? kwhEquivalent({ elektrikKwh: bz.elektrikKwh, dogalgazM3: bz.dogalgazM3, komurKg: bz.komurKg })
        : null,
    };
  }).filter((r) => r.kwhEq > 0 || r.tCO2e > 0);

  return (
    <>
      <PageHeader
        eyebrow="binalar"
        title="Bina enerji performansı"
        desc={`${org.name} · ${year} enerji yoğunluğu ve ${org.baselineYear} baz yılına göre tasarruf`}
      />
      <BinalarClient year={year} baselineYear={org.baselineYear} rows={rows} hedefPct={orgRow.enerjiTasarrufHedefiPct} />
    </>
  );
}
