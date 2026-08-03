/* Paylaşılan veri erişimi — panel, raporlar ve API'ler aynı sorguları kullanır. */
import { prisma } from "./prisma";
import type { EmissionRow } from "./carbon/engine";
import { CATEGORIES, type CategoryCode } from "./constants";

/** Kurumun onaylı hesap izlerini motor satırlarına dönüştürür. */
export async function getEmissionRows(orgId: string): Promise<EmissionRow[]> {
  const records = await prisma.emissionRecord.findMany({
    where: { activityData: { facility: { orgId } } },
    select: {
      scope: true,
      tCO2e: true,
      activityData: {
        select: { year: true, month: true, category: true, facilityId: true, facility: { select: { unitId: true } } },
      },
    },
  });
  return records.map((r) => ({
    year: r.activityData.year,
    month: r.activityData.month,
    category: r.activityData.category as CategoryCode,
    scope: r.scope as 1 | 2 | 3,
    tCO2e: r.tCO2e,
    facilityId: r.activityData.facilityId,
    unitId: r.activityData.facility.unitId ?? undefined,
  }));
}

/** Yıl için tesis başına eksik kategori tespiti: tesiste daha önce görülen ama son ayda olmayan. */
export async function getMissingData(orgId: string, year: number, month: number) {
  const facilities = await prisma.facility.findMany({
    where: { orgId },
    select: { id: true, name: true, activityData: { select: { category: true, year: true, month: true } } },
  });
  const out: { facilityId: string; facility: string; category: string }[] = [];
  for (const f of facilities) {
    const seen = new Set(f.activityData.map((a) => a.category));
    const inMonth = new Set(
      f.activityData.filter((a) => a.year === year && a.month === month).map((a) => a.category)
    );
    for (const c of seen) if (!inMonth.has(c)) out.push({ facilityId: f.id, facility: f.name, category: c });
  }
  return out;
}

/** Kurumun veri girilmiş son (yıl, ay) dönemi. */
export async function getLatestPeriod(orgId: string): Promise<{ year: number; month: number } | null> {
  const last = await prisma.activityData.findFirst({
    where: { facility: { orgId } },
    orderBy: [{ year: "desc" }, { month: "desc" }],
    select: { year: true, month: true },
  });
  return last;
}

export async function getPendingCount(orgId: string): Promise<number> {
  return prisma.activityData.count({ where: { status: "TASLAK", facility: { orgId } } });
}

/** Etkin faktör: kurum tanımı > küresel varsayılan (iki sorgu — SQLite/Postgres null sıralama farkına takılmaz). */
export async function resolveFactor(orgId: string, category: string) {
  const own = await prisma.emissionFactor.findFirst({
    where: { category, orgId },
    orderBy: { year: "desc" },
  });
  if (own) return own;
  return prisma.emissionFactor.findFirst({
    where: { category, orgId: null },
    orderBy: { year: "desc" },
  });
}

export function categoryLabel(code: string): string {
  return CATEGORIES.find((c) => c.code === code)?.label ?? code;
}
