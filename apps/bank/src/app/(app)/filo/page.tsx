import Link from "next/link";
import { getScope } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui";
import { FiloClient, type FleetVehicle } from "@/components/filo-client";
import {
  detectAnomalies, fleetPriorityScore, FILO_EV_NET_AZALTIM,
  monthlyScopeTotals, type EmissionRow,
} from "@/lib/carbon/engine";
import type { CategoryCode } from "@/lib/constants";
import { MONTHS_TR } from "@/lib/constants";

export default async function FiloPage() {
  const { session, org, year, birim } = await getScope();
  const bu = birim.unitId;

  const [vehicles, fleetFacilities, vehicleRecords, poolRecords] = await Promise.all([
    prisma.vehicle.findMany({
      where: { orgId: org.id, ...(bu ? { facility: { unitId: bu } } : {}) },
      include: { facility: { select: { id: true, name: true } } },
      orderBy: { plateNo: "asc" },
    }),
    prisma.facility.findMany({
      where: { orgId: org.id, type: "ARAC_FILOSU", ...(bu ? { unitId: bu } : {}) },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    // araç bağlı hesap izleri (tüm yıllar — anomali için geçmiş gerekir)
    prisma.emissionRecord.findMany({
      where: { activityData: { vehicleId: { not: null }, facility: { orgId: org.id, ...(bu ? { unitId: bu } : {}) } } },
      select: {
        scope: true, tCO2e: true,
        activityData: { select: { vehicleId: true, year: true, month: true, category: true, amount: true } },
      },
    }),
    // havuz: filo tesislerine girilmiş araçsız kayıtlar (seçili yıl)
    prisma.emissionRecord.findMany({
      where: { activityData: { vehicleId: null, year, facility: { orgId: org.id, type: "ARAC_FILOSU", ...(bu ? { unitId: bu } : {}) } } },
      select: { scope: true, tCO2e: true, activityData: { select: { year: true, month: true, category: true } } },
    }),
  ]);

  /* araç bazlı yıllık toplam + anomaliler */
  const byVehicle = new Map<string, { tCO2e: number; series: { key: string; amount: number; category: string }[] }>();
  for (const r of vehicleRecords) {
    const vid = r.activityData.vehicleId!;
    const cur = byVehicle.get(vid) ?? { tCO2e: 0, series: [] };
    if (r.activityData.year === year) cur.tCO2e += r.tCO2e;
    cur.series.push({
      key: `${r.activityData.year}-${String(r.activityData.month).padStart(2, "0")}`,
      amount: r.activityData.amount,
      category: r.activityData.category,
    });
    byVehicle.set(vid, cur);
  }

  const fleet: FleetVehicle[] = vehicles.map((v) => {
    const agg = byVehicle.get(v.id);
    const t = agg?.tCO2e ?? 0;
    /* anomali: aracın baskın yakıt kategorisinin son 12 aylık serisi */
    const anomalies: FleetVehicle["anomalies"] = [];
    if (agg) {
      const byCat = new Map<string, { key: string; amount: number }[]>();
      for (const p of agg.series) {
        const list = byCat.get(p.category) ?? [];
        list.push({ key: p.key, amount: p.amount });
        byCat.set(p.category, list);
      }
      for (const [cat, list] of byCat) {
        const sorted = list.sort((a, b) => a.key.localeCompare(b.key)).slice(-12);
        for (const a of detectAnomalies(sorted.map((p) => p.amount))) {
          const [yy, mm] = sorted[a.index].key.split("-").map(Number);
          anomalies.push({
            period: `${MONTHS_TR[mm - 1]} ${yy}`,
            category: cat,
            deviationPct: a.deviationPct,
            severity: a.severity,
          });
        }
      }
    }
    return {
      id: v.id, plateNo: v.plateNo, name: v.name, vehicleType: v.vehicleType, fuelType: v.fuelType,
      modelYear: v.modelYear, active: v.active, facilityId: v.facility?.id ?? null,
      facilityName: v.facility?.name ?? null,
      yearTCO2e: t,
      priority: fleetPriorityScore(v.fuelType, t),
      evSavingTCO2e: v.fuelType === "ELEKTRIK" ? 0 : t * FILO_EV_NET_AZALTIM,
      anomalies,
    };
  });

  /* yakıt türü dağılımı (araç bazlı) + havuz */
  const fuelTotals = new Map<string, number>();
  for (const f of fleet) {
    if (f.yearTCO2e <= 0) continue;
    fuelTotals.set(f.fuelType, (fuelTotals.get(f.fuelType) ?? 0) + f.yearTCO2e);
  }
  const poolTCO2e = poolRecords.reduce((a, r) => a + r.tCO2e, 0);

  /* filo aylık eğilim (araç + havuz, seçili yıl) */
  const engineRows: EmissionRow[] = [
    ...vehicleRecords
      .filter((r) => r.activityData.year === year)
      .map((r) => ({
        year: r.activityData.year, month: r.activityData.month,
        category: r.activityData.category as CategoryCode, scope: r.scope as 1 | 2 | 3, tCO2e: r.tCO2e,
      })),
    ...poolRecords.map((r) => ({
      year: r.activityData.year, month: r.activityData.month,
      category: r.activityData.category as CategoryCode, scope: r.scope as 1 | 2 | 3, tCO2e: r.tCO2e,
    })),
  ];
  const monthlyMap = monthlyScopeTotals(engineRows);
  const monthly = Array.from({ length: 12 }, (_, i) => {
    const key = `${year}-${String(i + 1).padStart(2, "0")}`;
    return { month: MONTHS_TR[i], tCO2e: monthlyMap.get(key)?.total ?? 0 };
  });

  return (
    <>
      <PageHeader
        eyebrow="araç filosu"
        title="Filo emisyon takibi"
        desc={`${org.name} · ${vehicles.length} kayıtlı araç · ${year} yakıt tüketimi ve dönüşüm önceliği`}
        actions={
          <Link href="/veri-kalite" className="rounded-xl border border-leaf-200 bg-white/70 px-3.5 py-2 text-[12.5px] font-medium text-leaf-700 transition hover:bg-leaf-50">
            yakıt verisi kalitesi →
          </Link>
        }
      />
      <FiloClient
        orgId={org.id}
        year={year}
        vehicles={fleet}
        fuelTotals={[...fuelTotals.entries()].map(([fuel, t]) => ({ fuel, tCO2e: t }))}
        poolTCO2e={poolTCO2e}
        monthly={monthly}
        facilities={fleetFacilities}
        canEdit={["SUPER_ADMIN", "IKLIM_MERKEZI", "FILO_YONETICISI"].includes(session.role)}
        canDelete={["SUPER_ADMIN", "IKLIM_MERKEZI", "FILO_YONETICISI"].includes(session.role)}
      />
    </>
  );
}
