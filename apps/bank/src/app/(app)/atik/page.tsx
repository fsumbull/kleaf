/* Atık yönetimi — depolama vs saptırma akışı, krediler, bertaraf maliyeti */
import Link from "next/link";
import { getScope } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ORGANIK_ATIK_ORANI } from "@/lib/carbon/engine";
import { MONTHS_TR } from "@/lib/constants";
import { PageHeader } from "@/components/ui";
import { AtikClient, type AtikMonthly, type AtikFacilityRow } from "@/components/atik-client";

const WASTE_CATS = ["ATIK", "GERI_DONUSUM", "KOMPOST"] as const;

export default async function AtikPage() {
  const { org, year, birim } = await getScope();
  const bu = birim.unitId;

  const [records, orgRow] = await Promise.all([
    prisma.activityData.findMany({
      where: { facility: { orgId: org.id, ...(bu ? { unitId: bu } : {}) }, category: { in: [...WASTE_CATS] }, year },
      select: {
        category: true, month: true, amount: true,
        facility: { select: { name: true } },
        emissionRecord: { select: { tCO2e: true } },
      },
    }),
    prisma.organization.findUniqueOrThrow({
      where: { id: org.id },
      select: { atikBertarafTRYPerTon: true },
    }),
  ]);

  const totals = { depolamaTon: 0, geriDonusumTon: 0, kompostTon: 0, depolamaTCO2e: 0, krediTCO2e: 0, organikPotansiyelTon: 0 };
  const monthly: AtikMonthly[] = MONTHS_TR.map((m) => ({ month: m, depolama: 0, geriDonusum: 0, kompost: 0 }));
  const byFacility = new Map<string, AtikFacilityRow>();

  for (const r of records) {
    const t = r.emissionRecord?.tCO2e ?? 0;
    const f = byFacility.get(r.facility.name) ?? { facility: r.facility.name, depolamaTon: 0, geriDonusumTon: 0, kompostTon: 0, netTCO2e: 0 };
    if (r.category === "ATIK") {
      totals.depolamaTon += r.amount;
      totals.depolamaTCO2e += t;
      monthly[r.month - 1].depolama += r.amount;
      f.depolamaTon += r.amount;
    } else if (r.category === "GERI_DONUSUM") {
      totals.geriDonusumTon += r.amount;
      totals.krediTCO2e += Math.abs(t);
      monthly[r.month - 1].geriDonusum += r.amount;
      f.geriDonusumTon += r.amount;
    } else {
      totals.kompostTon += r.amount;
      totals.krediTCO2e += Math.abs(t);
      monthly[r.month - 1].kompost += r.amount;
      f.kompostTon += r.amount;
    }
    f.netTCO2e += t;
    byFacility.set(r.facility.name, f);
  }
  totals.organikPotansiyelTon = totals.depolamaTon * ORGANIK_ATIK_ORANI;

  const facilities = [...byFacility.values()].sort((a, b) => b.netTCO2e - a.netTCO2e);

  return (
    <>
      <PageHeader
        eyebrow="atık yönetimi"
        title="Atık akışı ve saptırma"
        desc={`${org.name} · ${year} depolama, geri dönüşüm ve kompost dengesi`}
        actions={
          <Link href="/senaryolar" className="rounded-xl border border-leaf-200 bg-white/70 px-3.5 py-2 text-[12.5px] font-medium text-leaf-700 transition hover:bg-leaf-50">
            azaltım senaryosu kur →
          </Link>
        }
      />
      <AtikClient
        year={year}
        totals={totals}
        monthly={monthly}
        facilities={facilities}
        bertarafTRYPerTon={orgRow.atikBertarafTRYPerTon}
      />
    </>
  );
}
