/* GES — üretim izleme, şebeke karşılama, fizibilite */
import { getScope } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolveFactor } from "@/lib/data";
import { MONTHS_TR } from "@/lib/constants";
import { PageHeader } from "@/components/ui";
import { GesClient, type GesFacility } from "@/components/ges-client";

export default async function GesPage() {
  const { org, year, birim } = await getScope();
  const bu = birim.unitId;

  const [gesFacilities, gesRecords, sebeke, orgRow, factor] = await Promise.all([
    prisma.facility.findMany({
      where: { orgId: org.id, type: "GES", ...(bu ? { unitId: bu } : {}) },
      select: { id: true, name: true, installedKwp: true, commissionYear: true, capexTRY: true },
      orderBy: { name: "asc" },
    }),
    prisma.activityData.findMany({
      where: { facility: { orgId: org.id, ...(bu ? { unitId: bu } : {}) }, category: { in: ["GES_URETIM", "GES_SATIS"] }, year },
      select: { facilityId: true, category: true, month: true, amount: true, emissionRecord: { select: { tCO2e: true } } },
    }),
    prisma.activityData.aggregate({
      where: { facility: { orgId: org.id, ...(bu ? { unitId: bu } : {}) }, category: "ELEKTRIK", year },
      _sum: { amount: true },
    }),
    prisma.organization.findUniqueOrThrow({
      where: { id: org.id },
      select: { elektrikTRYPerKwh: true, gesKwhPerKwp: true, gesCapexTRYPerKwp: true },
    }),
    resolveFactor(org.id, "ELEKTRIK"),
  ]);

  const monthly = MONTHS_TR.map((m) => ({ month: m, kwh: 0 }));
  const byFacility = new Map<string, { uretimKwh: number; satisKwh: number; mahsupTCO2e: number }>();
  for (const r of gesRecords) {
    const f = byFacility.get(r.facilityId) ?? { uretimKwh: 0, satisKwh: 0, mahsupTCO2e: 0 };
    if (r.category === "GES_URETIM") {
      f.uretimKwh += r.amount;
      f.mahsupTCO2e += Math.abs(r.emissionRecord?.tCO2e ?? 0);
      monthly[r.month - 1].kwh += r.amount;
    } else {
      f.satisKwh += r.amount;
    }
    byFacility.set(r.facilityId, f);
  }

  const facilities: GesFacility[] = gesFacilities.map((g) => ({
    ...g,
    uretimKwh: byFacility.get(g.id)?.uretimKwh ?? 0,
    satisKwh: byFacility.get(g.id)?.satisKwh ?? 0,
    mahsupTCO2e: byFacility.get(g.id)?.mahsupTCO2e ?? 0,
  }));

  return (
    <>
      <PageHeader
        eyebrow="güneş enerjisi"
        title="GES üretim ve fizibilite"
        desc={`${org.name} · ${year} üretimi, şebeke karşılama oranı ve yeni yatırım analizi`}
      />
      <GesClient
        year={year}
        facilities={facilities}
        monthly={monthly}
        sebekeKwh={sebeke._sum.amount ?? 0}
        elektrikFaktoru={factor?.kgCO2ePerUnit ?? 0.442}
        elektrikFiyati={orgRow.elektrikTRYPerKwh}
        kwhPerKwp={orgRow.gesKwhPerKwp}
        capexPerKwp={orgRow.gesCapexTRYPerKwp}
      />
    </>
  );
}
