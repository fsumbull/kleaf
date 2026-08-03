/* Faaliyet verisi onay/iptal iş kuralları — API rotalarının ortak çekirdeği. */
import { prisma } from "./prisma";
import { resolveFactor } from "./data";
import { computeKgCO2e, kgToTons, scopeOf, CALC_VERSION } from "./carbon/engine";
import type { CategoryCode } from "./constants";

/** Kaydı onaylar: etkin faktörü çözer, emisyonu hesaplar, hesap izini (snapshot) yazar. */
export async function approveActivity(activityId: string, orgId: string) {
  const act = await prisma.activityData.findUnique({ where: { id: activityId } });
  if (!act) throw new Error("Kayıt bulunamadı");

  const factor = await resolveFactor(orgId, act.category);
  if (!factor) throw new Error(`"${act.category}" için emisyon faktörü tanımlı değil`);

  const cat = act.category as CategoryCode;
  const tCO2e = kgToTons(computeKgCO2e(cat, act.amount, factor.kgCO2ePerUnit));
  const snapshot = JSON.stringify({
    factorId: factor.id,
    kgCO2ePerUnit: factor.kgCO2ePerUnit,
    unit: factor.unit,
    source: factor.source,
    year: factor.year,
    orgSpecific: factor.orgId !== null,
  });

  await prisma.$transaction([
    prisma.activityData.update({ where: { id: activityId }, data: { status: "ONAYLI" } }),
    prisma.emissionRecord.upsert({
      where: { activityDataId: activityId },
      create: { activityDataId: activityId, scope: scopeOf(cat), tCO2e, factorSnapshot: snapshot, calcVersion: CALC_VERSION },
      update: { scope: scopeOf(cat), tCO2e, factorSnapshot: snapshot, calcVersion: CALC_VERSION },
    }),
  ]);
  return tCO2e;
}

/** Onayı geri alır: hesap izi silinir, kayıt taslağa döner. */
export async function revertActivity(activityId: string) {
  await prisma.$transaction([
    prisma.emissionRecord.deleteMany({ where: { activityDataId: activityId } }),
    prisma.activityData.update({ where: { id: activityId }, data: { status: "TASLAK" } }),
  ]);
}

/** Müdürlük ara onayı: kayıt merkez onayına hazır işaretlenir (hesap izi yazılmaz). */
export async function mudurlukOnayla(activityId: string) {
  await prisma.activityData.update({ where: { id: activityId }, data: { status: "MUDURLUK_ONAYLI" } });
}

/** Faaliyet kaydının kurum aidiyetini doğrular; kaydı döndürür. */
export async function getOwnedActivity(activityId: string, orgId: string | null, isSuper: boolean) {
  const act = await prisma.activityData.findUnique({
    where: { id: activityId },
    include: { facility: { select: { orgId: true, name: true, unitId: true } } },
  });
  if (!act) return null;
  if (!isSuper && act.facility.orgId !== orgId) return null;
  return act;
}
