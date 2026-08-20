/* KarbonKent Kurumsal demo tohum verisi — tek belediye, gerçekçi mevsimsel 24 aylık tüketim (2024-07 → 2026-06).
 * Deterministik LCG ile tekrarlanabilir. Onaylı kayıtlar için EmissionRecord (faktör kopyalı) üretilir. */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { DEFAULT_FACTORS } from "../src/lib/carbon/factors";
import { computeKgCO2e, kgToTons, scopeOf, CALC_VERSION, linearNetZeroPath, yearScopeTotals, type EmissionRow } from "../src/lib/carbon/engine";
import type { CategoryCode } from "../src/lib/constants";
import { categoryMeta } from "../src/lib/constants";
import { kalemEslestir } from "../src/lib/envanter";
import { ENVANTER_GRUPLARI, ENVANTER_BIRIMLERI, ENVANTER_KALEMLERI } from "./envanter-kalemleri";

const prisma = new PrismaClient();

/* deterministik rastgele */
let seedState = 20260704;
const rnd = () => (seedState = (seedState * 1664525 + 1013904223) % 4294967296) / 4294967296;
const jitter = (base: number, pct = 0.08) => base * (1 + (rnd() * 2 - 1) * pct);

/* mevsimsellik: 1-12 → çarpan */
const season = {
  /** kış pik (ısıtma): oca≈1.9, tem≈0.15 */
  heating: (m: number) => 1 + 0.9 * Math.cos(((m - 1) / 12) * Math.PI * 2) - (m >= 6 && m <= 8 ? 0.05 : 0),
  /** yaz pik (soğutma): tem≈1.35 */
  cooling: (m: number) => 1 + 0.35 * Math.cos(((m - 7) / 12) * Math.PI * 2),
  /** kış hafif pik (uzun geceler — aydınlatma) */
  lighting: (m: number) => 1 + 0.22 * Math.cos(((m - 1) / 12) * Math.PI * 2),
  /** yaz pik (GES üretimi): tem≈1.45, oca≈0.55 */
  solar: (m: number) => 1 + 0.45 * Math.cos(((m - 7) / 12) * Math.PI * 2),
  flat: (_m: number) => 1,
};
type SeasonKind = keyof typeof season;

interface FacilityPlan {
  name: string;
  type: string;
  areaM2?: number;
  staffCount?: number;
  unit?: string;
  lat?: number;
  lng?: number;
  /** GES tesisleri için künye */
  installedKwp?: number;
  commissionYear?: number;
  capexTRY?: number;
  /** kategori → [aylık taban miktar, mevsim eğrisi] */
  lines: Partial<Record<CategoryCode, [number, SeasonKind]>>;
}

interface VehiclePlan {
  plateNo: string;
  name: string;
  vehicleType: string;
  fuelType: string;
  modelYear: number;
  facility: string; // bağlı filo tesisi adı
  /** kategori → aylık taban miktar (mevsimsiz, düz) */
  lines: Partial<Record<CategoryCode, number>>;
  /** anomali demosu: [yıl, ay, çarpan] — o ay tüketim çarpılır */
  spike?: [number, number, number];
}

interface OrgPlan {
  name: string;
  type: string;
  baselineYear: number;
  units: string[];
  facilities: FacilityPlan[];
  vehicles?: VehiclePlan[];
  neighborhoods?: { name: string; population: number; lat?: number; lng?: number }[];
  /** kent ölçeği yıllık sektör verisi: [sektör, kategori, 2024 tutarı] — 2025 = ×0.97 */
  cityData?: [string, CategoryCode, number][];
  actions: { title: string; description: string; budgetTRY: number; targetReductionTCO2e: number; status: string; owner: string; startYear: number; startDate?: string; endDate?: string; riskNote?: string; progress?: { note: string; achievedTCO2e: number; spentTRY: number }[] }[];
}

/* Belediye demo planları — İBB tek belediye olarak seedEnvanterVeBanka içinde
 * envanter kataloğundan kurulur; bu jenerik plan listesi artık boştur (Yeşilova kaldırıldı). */
const ORGS: OrgPlan[] = [];

/* 24 ay: 2024-07 → 2026-06 */
const MONTHS: { year: number; month: number }[] = [];
for (let i = 0; i < 24; i++) {
  const y = 2024 + Math.floor((6 + i) / 12);
  const m = ((6 + i) % 12) + 1;
  MONTHS.push({ year: y, month: m });
}
const LAST = MONTHS[MONTHS.length - 1]; // 2026-06

async function main() {
  console.log("→ temizlik…");
  await prisma.$transaction([
    prisma.auditDecision.deleteMany(), prisma.complianceFlag.deleteMany(),
    prisma.auditLog.deleteMany(), prisma.emissionRecord.deleteMany(),
    prisma.document.deleteMany(), prisma.activityData.deleteMany(),
    prisma.creditRetirement.deleteMany(), prisma.creditTransaction.deleteMany(), prisma.creditPool.deleteMany(),
    prisma.clientAccount.deleteMany(), prisma.tradeOrder.deleteMany(), prisma.priceCurve.deleteMany(), prisma.branchCandidate.deleteMany(),
    prisma.creditProject.deleteMany(), prisma.projectDeveloper.deleteMany(),
    prisma.inventoryEntry.deleteMany(), prisma.inventoryItem.deleteMany(), prisma.inventoryGroup.deleteMany(),
    prisma.dataTask.deleteMany(), prisma.period.deleteMany(), prisma.apiKey.deleteMany(),
    prisma.actionProgress.deleteMany(), prisma.actionPlan.deleteMany(), prisma.scenario.deleteMany(),
    prisma.target.deleteMany(), prisma.emissionFactor.deleteMany(), prisma.cityActivity.deleteMany(),
    prisma.neighborhood.deleteMany(), prisma.vehicle.deleteMany(), prisma.user.deleteMany(),
    prisma.facility.deleteMany(), prisma.unit.deleteMany(), prisma.organization.deleteMany(),
  ]);

  console.log("→ küresel faktör kütüphanesi…");
  await prisma.emissionFactor.createMany({
    data: DEFAULT_FACTORS.map((f) => ({ ...f, orgId: null })),
  });
  const factorOf = (cat: CategoryCode) => DEFAULT_FACTORS.find((f) => f.category === cat)!;

  const passwordHash = bcrypt.hashSync("kleaf2026", 10);

  for (const plan of ORGS) {
    console.log(`→ ${plan.name}…`);
    const org = await prisma.organization.create({
      data: { name: plan.name, type: plan.type, baselineYear: plan.baselineYear, netZeroYear: 2053 },
    });
    const unitMap = new Map<string, string>();
    for (const u of plan.units) {
      const unit = await prisma.unit.create({ data: { name: u, orgId: org.id } });
      unitMap.set(u, unit.id);
    }

    /* faaliyet verileri */
    type Row = { facilityId: string; vehicleId?: string; vehicleKey?: string; year: number; month: number; category: CategoryCode; amount: number; unit: string; status: string; documentRef: string };
    const rows: Row[] = [];
    const facMap = new Map<string, string>();
    for (const f of plan.facilities) {
      const fac = await prisma.facility.create({
        data: {
          name: f.name, type: f.type, areaM2: f.areaM2 ?? null, staffCount: f.staffCount ?? null,
          lat: f.lat ?? null, lng: f.lng ?? null,
          installedKwp: f.installedKwp ?? null, commissionYear: f.commissionYear ?? null, capexTRY: f.capexTRY ?? null,
          unitId: f.unit ? unitMap.get(f.unit) ?? null : null, orgId: org.id,
        },
      });
      facMap.set(f.name, fac.id);
      for (const [cat, [base, kind]] of Object.entries(f.lines) as [CategoryCode, [number, SeasonKind]][]) {
        for (const { year, month } of MONTHS) {
          /* yıllık %4 iyileşme (GES üretimi hariç) + mevsim + gürültü */
          const yearIdx = year - 2024 + (month - 7) / 12;
          const improve = cat === "GES_URETIM" ? 1 : Math.pow(0.96, Math.max(0, yearIdx));
          const amount = Math.round(jitter(base * season[kind](month) * improve));
          if (amount <= 0) continue;
          /* eksik veri senaryosu: Yeşilova'da son ayda iki satır atlanır */
          if (org.name === "Yeşilova Belediyesi" && year === LAST.year && month === LAST.month &&
              ((f.name === "Ek Hizmet Binası" && cat === "ELEKTRIK") || (f.name === "Hizmet Araçları Filosu" && cat === "BENZIN"))) continue;
          /* onay akışı demosu: Yeşilova'nın son ayı taslak bekler */
          const status = org.name === "Yeşilova Belediyesi" && year === LAST.year && month === LAST.month ? "TASLAK" : "ONAYLI";
          rows.push({
            facilityId: fac.id, year, month, category: cat, amount,
            unit: categoryMeta(cat).unit, status,
            documentRef: `FT-${year}${String(month).padStart(2, "0")}-${fac.id.slice(-4).toUpperCase()}`,
          });
        }
      }
    }

    /* araçlar + araç bazlı yakıt kayıtları */
    for (const v of plan.vehicles ?? []) {
      const veh = await prisma.vehicle.create({
        data: {
          orgId: org.id, facilityId: facMap.get(v.facility) ?? null,
          plateNo: v.plateNo, name: v.name, vehicleType: v.vehicleType, fuelType: v.fuelType,
          modelYear: v.modelYear, active: true,
        },
      });
      for (const [cat, base] of Object.entries(v.lines) as [CategoryCode, number][]) {
        for (const { year, month } of MONTHS) {
          const yearIdx = year - 2024 + (month - 7) / 12;
          const improve = Math.pow(0.96, Math.max(0, yearIdx));
          let amount = jitter(base * improve);
          if (v.spike && v.spike[0] === year && v.spike[1] === month) amount *= v.spike[2]; // anomali demosu
          amount = Math.round(amount);
          if (amount <= 0) continue;
          const status = org.name === "Yeşilova Belediyesi" && year === LAST.year && month === LAST.month ? "TASLAK" : "ONAYLI";
          rows.push({
            facilityId: facMap.get(v.facility)!, vehicleId: veh.id, vehicleKey: veh.id,
            year, month, category: cat, amount, unit: categoryMeta(cat).unit, status,
            documentRef: `AK-${year}${String(month).padStart(2, "0")}-${v.plateNo.replace(/\s/g, "")}`,
          });
        }
      }
    }
    await prisma.activityData.createMany({ data: rows });

    /* onaylılara hesap izi (faktör kopyalı) */
    const saved = await prisma.activityData.findMany({
      where: { facility: { orgId: org.id }, status: "ONAYLI" },
      select: { id: true, category: true, amount: true },
    });
    await prisma.emissionRecord.createMany({
      data: saved.map((a) => {
        const f = factorOf(a.category as CategoryCode);
        return {
          activityDataId: a.id,
          scope: scopeOf(a.category as CategoryCode),
          tCO2e: kgToTons(computeKgCO2e(a.category as CategoryCode, a.amount, f.kgCO2ePerUnit)),
          factorSnapshot: JSON.stringify(f),
          calcVersion: CALC_VERSION,
        };
      }),
    });

    /* hedefler: baz yıl (2024 H2 ×2 yıllıklandırma) → 2053 doğrusal patikadan 2025-2031 */
    const recRows = await prisma.emissionRecord.findMany({
      where: { activityData: { facility: { orgId: org.id } } },
      select: { scope: true, tCO2e: true, activityData: { select: { year: true, month: true, category: true } } },
    });
    const engineRows: EmissionRow[] = recRows.map((r) => ({
      year: r.activityData.year, month: r.activityData.month,
      category: r.activityData.category as CategoryCode,
      scope: r.scope as 1 | 2 | 3, tCO2e: r.tCO2e,
    }));
    const baselineAnnual = yearScopeTotals(engineRows, plan.baselineYear).total * 2; // H2 → yıllık yaklaşık
    const path = linearNetZeroPath(plan.baselineYear, baselineAnnual, 2053);
    await prisma.target.createMany({
      data: Array.from({ length: 7 }, (_, i) => plan.baselineYear + 1 + i).map((year) => ({
        orgId: org.id, year, targetTCO2e: Math.round(path.get(year) ?? 0),
      })),
    });

    /* eylem planları */
    for (const a of plan.actions) {
      const ap = await prisma.actionPlan.create({
        data: {
          orgId: org.id, title: a.title, description: a.description, budgetTRY: a.budgetTRY,
          targetReductionTCO2e: a.targetReductionTCO2e, status: a.status, owner: a.owner, startYear: a.startYear,
          unitId: unitMap.get(a.owner) ?? null,
          startDate: a.startDate ? new Date(a.startDate) : null,
          endDate: a.endDate ? new Date(a.endDate) : null,
          riskNote: a.riskNote ?? null,
        },
      });
      for (const p of a.progress ?? []) {
        await prisma.actionProgress.create({
          data: { actionPlanId: ap.id, note: p.note, achievedTCO2e: p.achievedTCO2e, spentTRY: p.spentTRY },
        });
      }
    }

    /* mahalleler + kent ölçeği sektör verisi (yalnız belediye) */
    if (plan.neighborhoods?.length) {
      await prisma.neighborhood.createMany({
        data: plan.neighborhoods.map((n) => ({ orgId: org.id, name: n.name, population: n.population, lat: n.lat ?? null, lng: n.lng ?? null })),
      });
    }
    if (plan.cityData?.length) {
      await prisma.cityActivity.createMany({
        data: plan.cityData.flatMap(([sector, category, base]) => [2024, 2025].map((year) => ({
          orgId: org.id, year, sector, category,
          amount: Math.round(jitter(year === 2024 ? base : base * 0.97, 0.03)),
          status: "ONAYLI",
        }))),
      });
    }
  }

  /* süper admin — kuruma bağlı değil (tüm kurumları çerezle gezer) */
  console.log("→ süper admin…");
  await prisma.user.create({
    data: { email: "admin@kleaf.co", name: "kleaf Yönetici", role: "SUPER_ADMIN", orgId: null, passwordHash },
  });

  await seedEnvanterVeBanka(passwordHash);
}

/* ── M12-M13: küresel envanter kataloğu + İBB kurumu + KarbonBank ── */
async function seedEnvanterVeBanka(passwordHash: string) {
  console.log("→ envanter kataloğu (küresel şablon)…");
  const grupMap = new Map<string, string>();
  for (const g of ENVANTER_GRUPLARI) {
    const created = await prisma.inventoryGroup.create({ data: { code: g.code, name: g.name, sortOrder: g.sortOrder } });
    grupMap.set(g.code, created.id);
  }
  // küresel şablon kalemleri (orgId=null) — mod/kategori otomatik eşlenir
  const sablonlar: { id: string; unitName: string; name: string; dataUnit: string; isoCategory: string; mode: string; categoryCode: string | null; groupId: string }[] = [];
  for (const k of ENVANTER_KALEMLERI) {
    const es = kalemEslestir(k.ad, k.veriBirimi);
    const item = await prisma.inventoryItem.create({
      data: {
        groupId: grupMap.get(k.grupCode)!, orgId: null, unitName: k.birim,
        name: k.ad, dataUnit: k.veriBirimi, isoCategory: k.isoKategori,
        mode: es.mode, categoryCode: es.categoryCode,
      },
    });
    sablonlar.push({ id: item.id, unitName: k.birim, name: k.ad, dataUnit: k.veriBirimi, isoCategory: k.isoKategori, mode: es.mode, categoryCode: es.categoryCode, groupId: item.groupId });
  }

  console.log("→ İstanbul Büyükşehir Belediyesi…");
  const ibb = await prisma.organization.create({
    data: { name: "İstanbul Büyükşehir Belediyesi", type: "BELEDIYE", baselineYear: 2024, netZeroYear: 2050 },
  });
  const ibbUnitMap = new Map<string, string>();
  const ibbFacMap = new Map<string, string>(); // birim adı → tesis id
  let fi = 0;
  for (const b of ENVANTER_BIRIMLERI) {
    const unit = await prisma.unit.create({ data: { name: b, orgId: ibb.id } });
    ibbUnitMap.set(b, unit.id);
    const fac = await prisma.facility.create({
      data: {
        name: `${b} Hizmet Binası`, type: "BINA", orgId: ibb.id, unitId: unit.id,
        areaM2: 2_000 + Math.round(rnd() * 12_000), staffCount: 60 + Math.round(rnd() * 700),
        lat: 41.005 + (fi % 6) * 0.012 - 0.03, lng: 28.95 + Math.floor(fi / 6) * 0.018 - 0.04,
      },
    });
    ibbFacMap.set(b, fac.id);
    fi++;
  }

  // 342 şablon kalemi İBB'ye kopyala (sourceItemId ile izlenebilir)
  const ibbItems: typeof sablonlar = [];
  for (const t of sablonlar) {
    const item = await prisma.inventoryItem.create({
      data: {
        groupId: t.groupId, orgId: ibb.id, sourceItemId: t.id,
        unitId: ibbUnitMap.get(t.unitName) ?? null, unitName: t.unitName,
        name: t.name, dataUnit: t.dataUnit, isoCategory: t.isoCategory,
        mode: t.mode, categoryCode: t.categoryCode,
      },
    });
    ibbItems.push({ ...t, id: item.id });
  }

  // hesaplanabilir kalemlere 24 aylık faaliyet verisi (deterministik, mevsimsel)
  const KATEGORI_TABAN: Record<string, [number, SeasonKind]> = {
    ELEKTRIK: [42_000, "cooling"], DOGALGAZ: [7_500, "heating"], DIZEL: [2_800, "flat"],
    BENZIN: [850, "flat"], JENERATOR_DIZEL: [260, "flat"], SOGUTUCU_GAZ: [14, "cooling"],
  };
  type Row = { facilityId: string; inventoryItemId: string; inventoryKey: string; year: number; month: number; category: CategoryCode; amount: number; unit: string; status: string; documentRef: string };
  const ibbRows: Row[] = [];
  const hesaplanabilir = ibbItems.filter((i) => i.mode === "HESAPLANABILIR" && i.categoryCode);
  for (const item of hesaplanabilir) {
    const facilityId = ibbFacMap.get(item.unitName);
    if (!facilityId) continue;
    const cat = item.categoryCode as CategoryCode;
    const [taban, kind] = KATEGORI_TABAN[cat] ?? [1_000, "flat" as SeasonKind];
    for (const { year, month } of MONTHS) {
      const yearIdx = year - 2024 + (month - 7) / 12;
      const improve = Math.pow(0.97, Math.max(0, yearIdx));
      const amount = Math.round(jitter(taban * season[kind](month) * improve));
      if (amount <= 0) continue;
      const status = year === LAST.year && month === LAST.month ? "TASLAK" : "ONAYLI";
      ibbRows.push({
        facilityId, inventoryItemId: item.id, inventoryKey: item.id,
        year, month, category: cat, amount, unit: categoryMeta(cat).unit, status,
        documentRef: `IBB-${year}${String(month).padStart(2, "0")}-${item.id.slice(-4).toUpperCase()}`,
      });
    }
  }
  await prisma.activityData.createMany({ data: ibbRows });

  const ibbSaved = await prisma.activityData.findMany({
    where: { facility: { orgId: ibb.id }, status: "ONAYLI" },
    select: { id: true, category: true, amount: true },
  });
  const factorOf = (cat: CategoryCode) => DEFAULT_FACTORS.find((f) => f.category === cat)!;
  await prisma.emissionRecord.createMany({
    data: ibbSaved.map((a) => {
      const f = factorOf(a.category as CategoryCode);
      return {
        activityDataId: a.id,
        scope: scopeOf(a.category as CategoryCode),
        tCO2e: kgToTons(computeKgCO2e(a.category as CategoryCode, a.amount, f.kgCO2ePerUnit)),
        factorSnapshot: JSON.stringify(f),
        calcVersion: CALC_VERSION,
      };
    }),
  });

  // izleme kalemlerine son 6 ay örnek kayıt (ilk 15 kalem)
  const izlemeItems = ibbItems.filter((i) => i.mode === "IZLEME").slice(0, 15);
  const izlemeAylar = MONTHS.slice(-6);
  for (const item of izlemeItems) {
    for (const { year, month } of izlemeAylar) {
      await prisma.inventoryEntry.create({
        data: {
          orgId: ibb.id, itemId: item.id, year, month,
          amount: Math.round(jitter(500, 0.35)),
          note: null,
        },
      });
    }
  }

  // ── İBB planlama demo varlıkları: hedef patikası, eylem planları, senaryo, mahalle + kent ölçeği ──
  console.log("→ İBB hedef/eylem/senaryo/kent…");
  const ibbRecRows = await prisma.emissionRecord.findMany({
    where: { activityData: { facility: { orgId: ibb.id } } },
    select: { scope: true, tCO2e: true, activityData: { select: { year: true, month: true, category: true } } },
  });
  const ibbEngineRows: EmissionRow[] = ibbRecRows.map((r) => ({
    year: r.activityData.year, month: r.activityData.month,
    category: r.activityData.category as CategoryCode,
    scope: r.scope as 1 | 2 | 3, tCO2e: r.tCO2e,
  }));
  const ibbBaselineAnnual = yearScopeTotals(ibbEngineRows, 2024).total * 2; // H2 → yıllık yaklaşık
  const ibbPath = linearNetZeroPath(2024, ibbBaselineAnnual, 2050);
  await prisma.target.createMany({
    data: Array.from({ length: 7 }, (_, i) => 2025 + i).map((year) => ({
      orgId: ibb.id, year, targetTCO2e: Math.round(ibbPath.get(year) ?? 0),
    })),
  });

  const ibbActions: { title: string; description: string; budgetTRY: number; targetReductionTCO2e: number; status: string; owner: string; startYear: number; startDate?: string; endDate?: string; riskNote?: string; progress?: { note: string; achievedTCO2e: number; spentTRY: number }[] }[] = [
    { title: "Metro hattı elektrik verimliliği", description: "Raylı sistemde rejeneratif frenleme ve istasyon LED dönüşümü.", budgetTRY: 240_000_000, targetReductionTCO2e: 9_800, status: "DEVAM_EDIYOR", owner: "Raylı Sistem DB", startYear: 2025, startDate: "2025-01-15", endDate: "2027-12-31",
      progress: [{ note: "3 istasyon LED dönüşümü tamamlandı", achievedTCO2e: 1_200, spentTRY: 48_000_000 }] },
    { title: "Belediye filosu elektrifikasyonu", description: "Binek ve hafif ticari araçların %30'unun elektrikliye dönüşümü.", budgetTRY: 180_000_000, targetReductionTCO2e: 4_200, status: "DEVAM_EDIYOR", owner: "Ulaşım DB", startYear: 2025, startDate: "2025-04-01", endDate: "2027-06-30",
      progress: [{ note: "45 elektrikli araç teslim alındı", achievedTCO2e: 780, spentTRY: 62_000_000 }] },
    { title: "Kent geneli park aydınlatması güneş dönüşümü", description: "Yeşil alanlarda şebekeden bağımsız güneş enerjili aydınlatma.", budgetTRY: 95_000_000, targetReductionTCO2e: 2_100, status: "PLANLANDI", owner: "Park Bahçe ve Yeşil Alanlar DB", startYear: 2026, startDate: "2026-03-01", endDate: "2027-09-30", riskNote: "Tedarik zinciri ve panel temini gecikebilir." },
    { title: "Hizmet binaları ısı yalıtımı programı", description: "Daire başkanlığı binalarında dış cephe yalıtımı + ısı pompası.", budgetTRY: 120_000_000, targetReductionTCO2e: 3_400, status: "PLANLANDI", owner: "Destek Hizmetleri DB", startYear: 2026, startDate: "2026-02-01", endDate: "2028-01-31" },
  ];
  for (const a of ibbActions) {
    const ap = await prisma.actionPlan.create({
      data: {
        orgId: ibb.id, title: a.title, description: a.description, budgetTRY: a.budgetTRY,
        targetReductionTCO2e: a.targetReductionTCO2e, status: a.status, owner: a.owner, startYear: a.startYear,
        unitId: ibbUnitMap.get(a.owner) ?? null,
        startDate: a.startDate ? new Date(a.startDate) : null,
        endDate: a.endDate ? new Date(a.endDate) : null,
        riskNote: a.riskNote ?? null,
      },
    });
    for (const p of a.progress ?? []) {
      await prisma.actionProgress.create({
        data: { actionPlanId: ap.id, note: p.note, achievedTCO2e: p.achievedTCO2e, spentTRY: p.spentTRY },
      });
    }
  }

  await prisma.scenario.create({
    data: {
      orgId: ibb.id, name: "2035 iklim yol haritası",
      params: JSON.stringify({
        gesKwp: 25000, filoElektrifikasyonPct: 35, binaVerimlilikPct: 20,
        ledDonusumPct: 50, yalitimPct: 30, kazanPct: 25,
        kompostSaptirmaPct: 30, ayristirmaArtisiPct: 25, topluTasimaPct: 15,
      }),
    },
  });

  await prisma.neighborhood.createMany({
    data: [
      { orgId: ibb.id, name: "Kadıköy", population: 467_000, lat: 40.990, lng: 29.027 },
      { orgId: ibb.id, name: "Üsküdar", population: 524_000, lat: 41.022, lng: 29.015 },
      { orgId: ibb.id, name: "Beşiktaş", population: 176_000, lat: 41.043, lng: 29.007 },
      { orgId: ibb.id, name: "Bakırköy", population: 229_000, lat: 40.980, lng: 28.872 },
      { orgId: ibb.id, name: "Fatih", population: 397_000, lat: 41.019, lng: 28.949 },
      { orgId: ibb.id, name: "Başakşehir", population: 469_000, lat: 41.093, lng: 28.802 },
    ],
  });

  const ibbCityData: [string, CategoryCode, number][] = [
    ["KONUT", "ELEKTRIK", 9_600_000_000], ["KONUT", "DOGALGAZ", 2_100_000_000],
    ["TICARET", "ELEKTRIK", 5_400_000_000], ["TICARET", "DOGALGAZ", 650_000_000],
    ["KAMU_BINA", "ELEKTRIK", 820_000_000], ["KAMU_BINA", "DOGALGAZ", 190_000_000],
    ["ULASIM", "DIZEL", 1_450_000_000], ["ULASIM", "BENZIN", 980_000_000], ["ULASIM", "LPG", 520_000_000],
    ["ATIK", "ATIK", 4_600_000], ["ATIKSU", "SU", 780_000_000],
  ];
  await prisma.cityActivity.createMany({
    data: ibbCityData.flatMap(([sector, category, base]) => [2024, 2025].map((year) => ({
      orgId: ibb.id, year, sector, category,
      amount: Math.round(jitter(year === 2024 ? base : base * 0.97, 0.03)),
      status: "ONAYLI",
    }))),
  });

  console.log("→ Kleaf Karbon Bankası…");
  const banka = await prisma.organization.create({
    data: { name: "Kleaf Karbon Bankası", type: "KARBON_BANK", baselineYear: 2024, netZeroYear: 2050 },
  });
  const havuzlar = [
    { projectName: "Çamlıca Ağaçlandırma Projesi", standard: "GOLD_STANDARD", vintageYear: 2024, totalTCO2e: 25_000, priceTRYPerTon: 950 },
    { projectName: "Balıkesir Rüzgâr Enerjisi Santrali", standard: "VCS", vintageYear: 2025, totalTCO2e: 60_000, priceTRYPerTon: 720 },
    { projectName: "Ulusal Enerji Verimliliği Programı", standard: "ULUSAL", vintageYear: 2023, totalTCO2e: 15_000, priceTRYPerTon: 480 },
  ];
  const poolIds: string[] = [];
  for (const h of havuzlar) {
    const p = await prisma.creditPool.create({ data: { ...h, bankOrgId: banka.id, availableTCO2e: h.totalTCO2e } });
    poolIds.push(p.id);
  }

  // her durumdan işlem: TRANSFER(×2) + TALEP + BANKA_ONAY + RED + IPTAL (alıcı: İBB)
  const islemler: { poolIdx: number; buyer: string; amount: number; status: string; requestNote?: string; decisionNote?: string }[] = [
    { poolIdx: 0, buyer: ibb.id, amount: 5_000, status: "TRANSFER", requestNote: "2025 net sıfır ara hedefi mahsubu" },
    { poolIdx: 1, buyer: ibb.id, amount: 3_000, status: "TRANSFER", requestNote: "filo emisyonları telafisi" },
    { poolIdx: 1, buyer: ibb.id, amount: 2_500, status: "TALEP", requestNote: "2026 planlaması için ön alım" },
    { poolIdx: 2, buyer: ibb.id, amount: 800, status: "BANKA_ONAY", requestNote: "LED dönüşümü kalan emisyon telafisi" },
    { poolIdx: 0, buyer: ibb.id, amount: 12_000, status: "RED", requestNote: "toplu alım talebi", decisionNote: "havuz kapasitesinin üzerinde — bölünmüş talep önerilir" },
    { poolIdx: 2, buyer: ibb.id, amount: 1_200, status: "IPTAL", requestNote: "bütçe revizyonu nedeniyle geri çekildi" },
  ];
  const txIds: string[] = [];
  for (const t of islemler) {
    const pool = await prisma.creditPool.findUniqueOrThrow({ where: { id: poolIds[t.poolIdx] } });
    const tx = await prisma.creditTransaction.create({
      data: {
        poolId: pool.id, bankOrgId: banka.id, buyerOrgId: t.buyer,
        amountTCO2e: t.amount, priceTRYPerTon: pool.priceTRYPerTon,
        status: t.status, requestNote: t.requestNote ?? null, decisionNote: t.decisionNote ?? null,
      },
    });
    txIds.push(tx.id);
    if (t.status === "TRANSFER") {
      await prisma.creditPool.update({ where: { id: pool.id }, data: { availableTCO2e: { decrement: t.amount } } });
    }
  }
  // mahsuplar: ilk transferden 2 kayıt — net emisyon düşüşü demoda görünür
  await prisma.creditRetirement.createMany({
    data: [
      { orgId: ibb.id, transactionId: txIds[0], year: 2025, amountTCO2e: 2_000, note: "2025 envanter mahsubu" },
      { orgId: ibb.id, transactionId: txIds[0], year: 2026, amountTCO2e: 1_500, note: "2026 ilk yarı mahsubu" },
    ],
  });

  // ── KarbonBank envanteri: geliştiriciler, projeler, order book, fiyat eğrisi, müşteriler, şube adayları ──
  console.log("→ KarbonBank envanteri…");
  const dev1 = await prisma.projectDeveloper.create({ data: { bankOrgId: banka.id, name: "Anadolu Orman Karbon A.Ş.", rating: "A", contact: "orman@anadolukarbon.com" } });
  const dev2 = await prisma.projectDeveloper.create({ data: { bankOrgId: banka.id, name: "Ege Rüzgâr Enerji", rating: "A", contact: "info@egeruzgar.com" } });
  const dev3 = await prisma.projectDeveloper.create({ data: { bankOrgId: banka.id, name: "Ulusal Verimlilik Ajansı", rating: "B" } });

  const projeler: { name: string; projectType: string; standard: string; region: string; lat: number; lng: number; vintageYear: number; stage: string; expectedTCO2e: number; qualityRating: string; reversalRiskPct: number; developerId: string; poolIdx?: number }[] = [
    { name: "Çamlıca Ağaçlandırma Projesi", projectType: "AGACLANDIRMA", standard: "GOLD_STANDARD", region: "İstanbul", lat: 41.02, lng: 29.07, vintageYear: 2024, stage: "AKTIF", expectedTCO2e: 25_000, qualityRating: "AA", reversalRiskPct: 12, developerId: dev1.id, poolIdx: 0 },
    { name: "Balıkesir Rüzgâr Enerjisi Santrali", projectType: "YENILENEBILIR", standard: "VCS", region: "Balıkesir", lat: 39.65, lng: 27.88, vintageYear: 2025, stage: "AKTIF", expectedTCO2e: 60_000, qualityRating: "A", reversalRiskPct: 2, developerId: dev2.id, poolIdx: 1 },
    { name: "Ulusal Enerji Verimliliği Programı", projectType: "ENERJI_VERIMLILIGI", standard: "ULUSAL", region: "Ankara", lat: 39.93, lng: 32.85, vintageYear: 2023, stage: "AKTIF", expectedTCO2e: 15_000, qualityRating: "BBB", reversalRiskPct: 1, developerId: dev3.id, poolIdx: 2 },
    { name: "İzmit Körfezi Metan Yakalama", projectType: "METAN", standard: "VCS", region: "Kocaeli", lat: 40.77, lng: 29.92, vintageYear: 2026, stage: "DOGRULAMA", expectedTCO2e: 32_000, qualityRating: "A", reversalRiskPct: 3, developerId: dev2.id },
    { name: "Konya Ovası Biyokömür", projectType: "BIYOKOMUR", standard: "GOLD_STANDARD", region: "Konya", lat: 37.87, lng: 32.49, vintageYear: 2026, stage: "VALIDASYON", expectedTCO2e: 18_000, qualityRating: "A", reversalRiskPct: 5, developerId: dev1.id },
    { name: "Muğla Kıyı Mavi Karbon", projectType: "MAVI_KARBON", standard: "VCS", region: "Muğla", lat: 37.03, lng: 28.36, vintageYear: 2027, stage: "FIZIBILITE", expectedTCO2e: 12_000, qualityRating: "AAA", reversalRiskPct: 8, developerId: dev1.id },
  ];
  for (const p of projeler) {
    const { poolIdx, ...data } = p;
    const proj = await prisma.creditProject.create({ data: { bankOrgId: banka.id, ...data } });
    if (poolIdx !== undefined) {
      await prisma.creditPool.update({
        where: { id: poolIds[poolIdx] },
        data: { projectId: proj.id, projectType: data.projectType, qualityRating: data.qualityRating, bufferPct: data.reversalRiskPct, reservedTCO2e: Math.round(jitter(1_000, 0.4)) },
      });
    }
  }

  // fiyat eğrisi — son 6 ay, 3 standart
  const fiyatBaz: Record<string, [number, number]> = { GOLD_STANDARD: [950, 2024], VCS: [720, 2025], ULUSAL: [480, 2023] };
  const priceRows: { bankOrgId: string; standard: string; vintageYear: number; date: Date; priceTRYPerTon: number }[] = [];
  for (const [std, [baz, vintage]] of Object.entries(fiyatBaz)) {
    for (let i = 5; i >= 0; i--) {
      priceRows.push({ bankOrgId: banka.id, standard: std, vintageYear: vintage, date: new Date(2026, 6 - i, 1), priceTRYPerTon: Math.round(jitter(baz * (1 + (5 - i) * 0.02), 0.03)) });
    }
  }
  await prisma.priceCurve.createMany({ data: priceRows });

  // order book — açık, eşleşmiş ve iptal emirleri
  await prisma.tradeOrder.createMany({
    data: [
      { bankOrgId: banka.id, side: "SAT", standard: "GOLD_STANDARD", vintageYear: 2024, amountTCO2e: 2_000, priceTRYPerTon: 980, status: "ACIK" },
      { bankOrgId: banka.id, side: "SAT", standard: "VCS", vintageYear: 2025, amountTCO2e: 5_000, priceTRYPerTon: 735, status: "ACIK" },
      { bankOrgId: banka.id, side: "AL", standard: "VCS", vintageYear: 2026, amountTCO2e: 8_000, priceTRYPerTon: 690, status: "ACIK", counterparty: "Ege Rüzgâr Enerji" },
      { bankOrgId: banka.id, side: "AL", standard: "GOLD_STANDARD", vintageYear: 2026, amountTCO2e: 6_000, priceTRYPerTon: 910, status: "ESLESTI", counterparty: "Anadolu Orman Karbon" },
      { bankOrgId: banka.id, side: "SAT", standard: "ULUSAL", vintageYear: 2023, amountTCO2e: 1_200, priceTRYPerTon: 495, status: "ESLESTI", counterparty: "İBB" },
      { bankOrgId: banka.id, side: "SAT", standard: "GOLD_STANDARD", vintageYear: 2024, amountTCO2e: 3_000, priceTRYPerTon: 965, status: "IPTAL" },
    ],
  });

  // müşteri hesapları — İBB + 2 sanayi kurumu
  const sanayi1 = await prisma.organization.create({ data: { name: "Marmara Çimento A.Ş.", type: "SANAYI", baselineYear: 2024, netZeroYear: 2050 } });
  const sanayi2 = await prisma.organization.create({ data: { name: "Ege Demir-Çelik", type: "SANAYI", baselineYear: 2024, netZeroYear: 2050 } });
  await prisma.clientAccount.createMany({
    data: [
      { bankOrgId: banka.id, clientOrgId: ibb.id, segment: "BELEDIYE", creditLimitTRY: 50_000_000, balanceTCO2e: 4_500, status: "AKTIF" },
      { bankOrgId: banka.id, clientOrgId: sanayi1.id, segment: "SANAYI", creditLimitTRY: 30_000_000, balanceTCO2e: 8_200, status: "AKTIF" },
      { bankOrgId: banka.id, clientOrgId: sanayi2.id, segment: "SANAYI", creditLimitTRY: 20_000_000, balanceTCO2e: 3_100, status: "BEKLEMEDE" },
    ],
  });

  // şube açılım aday şehirleri (3D fırsat haritası) — [şehir, plaka, lat, lng, talep, arz, sanayi, nüfus, durum]
  const sehirler: [string, number, number, number, number, number, number, number, string][] = [
    ["İstanbul", 34, 41.01, 28.97, 95, 60, 92, 15_900_000, "MERKEZ"],
    ["Ankara", 6, 39.93, 32.85, 82, 65, 70, 5_700_000, "ACILDI"],
    ["İzmir", 35, 38.42, 27.14, 74, 72, 78, 4_400_000, "PLANLANDI"],
    ["Kocaeli", 41, 40.77, 29.95, 68, 55, 96, 2_050_000, "ADAY"],
    ["Bursa", 16, 40.19, 29.06, 66, 58, 88, 3_100_000, "ADAY"],
    ["Konya", 42, 37.87, 32.49, 52, 90, 60, 2_280_000, "ADAY"],
    ["Adana", 1, 37.0, 35.32, 58, 62, 74, 2_260_000, "ADAY"],
    ["Gaziantep", 27, 37.07, 37.38, 55, 50, 85, 2_130_000, "ADAY"],
    ["Antalya", 7, 36.9, 30.7, 61, 78, 45, 2_620_000, "ADAY"],
    ["Kayseri", 38, 38.73, 35.48, 47, 66, 72, 1_440_000, "ADAY"],
    ["Muğla", 48, 37.22, 28.36, 44, 85, 38, 1_030_000, "ADAY"],
    ["Erzurum", 25, 39.9, 41.27, 35, 88, 30, 760_000, "ADAY"],
    ["Samsun", 55, 41.29, 36.33, 49, 58, 55, 1_370_000, "ADAY"],
    ["Trabzon", 61, 41.0, 39.72, 41, 70, 40, 810_000, "ADAY"],
  ];
  await prisma.branchCandidate.createMany({
    data: sehirler.map(([city, plate, lat, lng, demand, supply, industry, pop, status]) => ({
      bankOrgId: banka.id, city, plate, lat, lng,
      demandScore: demand, supplyScore: supply, industryScore: industry, population: pop,
      opportunity: Math.round(0.4 * demand + 0.3 * supply + 0.3 * industry),
      status,
    })),
  });

  console.log("→ envanter/banka kullanıcıları…");
  // İBB müdürlük hesapları — her biri yalnız kendi biriminin verisini görür (LLM yetki testi için)
  const ibbMudurlukleri: { email: string; name: string; birim: string }[] = [
    { email: "ibb-cevre@kleaf.co", name: "Melis Öztürk", birim: "Çevre Koruma ve Kontrol DB" },
    { email: "ibb-ulasim@kleaf.co", name: "Kaan Yıldırım", birim: "Ulaşım DB" },
    { email: "ibb-park@kleaf.co", name: "Ece Demirtaş", birim: "Park Bahçe ve Yeşil Alanlar DB" },
    { email: "ibb-itfaiye@kleaf.co", name: "Burak Şahin", birim: "İtfaiye DB" },
    { email: "ibb-mezarlik@kleaf.co", name: "Hülya Aksoy", birim: "Mezarlıklar Daire Başkanlığı" },
    { email: "ibb-genclik@kleaf.co", name: "Onur Kaya", birim: "Gençlik ve Spor Hizmetleri DB" },
    { email: "ibb-saglik@kleaf.co", name: "Zeynep Arı", birim: "Sağlık DB" },
    { email: "ibb-rayli@kleaf.co", name: "Emre Çelik", birim: "Raylı Sistem DB" },
    { email: "ibb-destek@kleaf.co", name: "Sibel Korkmaz", birim: "Destek Hizmetleri DB" },
  ];
  await prisma.user.createMany({
    data: [
      { email: "ibb@kleaf.co", name: "Deniz Acar", role: "IKLIM_MERKEZI", orgId: ibb.id, passwordHash },
      ...ibbMudurlukleri.map((m) => ({
        email: m.email, name: m.name, role: "MUDURLUK_VERI", orgId: ibb.id,
        unitId: ibbUnitMap.get(m.birim) ?? null, passwordHash,
      })),
      { email: "ibb-ulasim-onay@kleaf.co", name: "Gökhan Er", role: "MUDURLUK_ONAY", orgId: ibb.id, unitId: ibbUnitMap.get("Ulaşım DB") ?? null, passwordHash },
      { email: "ust@kleaf.co", name: "Aslı Yalçın", role: "UST_YONETIM", orgId: ibb.id, passwordHash },
      { email: "mali@kleaf.co", name: "Tolga Şen", role: "MALI_HIZMETLER", orgId: ibb.id, passwordHash },
      { email: "banka@kleaf.co", name: "Selim Kurt", role: "BANKA_ADMIN", orgId: banka.id, passwordHash },
      { email: "analist@kleaf.co", name: "Nazlı Güneş", role: "BANKA_ANALIST", orgId: banka.id, passwordHash },
    ],
  });

  // ── B1: KarbonBank'ın kendi kurumsal karbon envanteri (birimler + şubeler + faaliyet + hedef + rezerv havuzu) ──
  console.log("→ KarbonBank kurumsal ayak izi…");
  const bankaBirimleri = ["Hazine", "Ticaret Masası", "Proje Geliştirme", "Operasyon", "BT ve Veri Merkezi"];
  const bankaUnitMap = new Map<string, string>();
  for (const b of bankaBirimleri) {
    const u = await prisma.unit.create({ data: { name: b, orgId: banka.id } });
    bankaUnitMap.set(b, u.id);
  }

  interface BankFacPlan { name: string; type: string; areaM2: number; staff: number; lat: number; lng: number; unit: string; lines: Partial<Record<CategoryCode, [number, SeasonKind]>>; }
  const bankaTesisler: BankFacPlan[] = [
    // İstanbul Genel Müdürlük (Levent)
    { name: "İstanbul Genel Müdürlük", type: "BINA", areaM2: 8500, staff: 240, lat: 41.0825, lng: 29.0075, unit: "Operasyon",
      lines: { ELEKTRIK: [72_000, "cooling"], DOGALGAZ: [4_800, "heating"], DIZEL: [420, "flat"], JENERATOR_DIZEL: [180, "flat"], SOGUTUCU_GAZ: [18, "cooling"] } },
    // Ankara şubesi
    { name: "Ankara Şubesi", type: "BINA", areaM2: 2100, staff: 55, lat: 39.9084, lng: 32.8556, unit: "Ticaret Masası",
      lines: { ELEKTRIK: [22_000, "cooling"], DOGALGAZ: [1_900, "heating"], DIZEL: [140, "flat"], JENERATOR_DIZEL: [60, "flat"], SOGUTUCU_GAZ: [6, "cooling"] } },
    // İzmir veri merkezi (24/7 yüksek elektrik + soğutma)
    { name: "İzmir Veri Merkezi", type: "TESIS", areaM2: 1400, staff: 18, lat: 38.4192, lng: 27.1287, unit: "BT ve Veri Merkezi",
      lines: { ELEKTRIK: [185_000, "flat"], JENERATOR_DIZEL: [520, "flat"], SOGUTUCU_GAZ: [42, "cooling"] } },
  ];
  const bankaFacMap = new Map<string, string>();
  const bankaRows: { facilityId: string; year: number; month: number; category: CategoryCode; amount: number; unit: string; status: string; documentRef: string }[] = [];
  for (const t of bankaTesisler) {
    const fac = await prisma.facility.create({
      data: { name: t.name, type: t.type, orgId: banka.id, unitId: bankaUnitMap.get(t.unit) ?? null,
        areaM2: t.areaM2, staffCount: t.staff, lat: t.lat, lng: t.lng },
    });
    bankaFacMap.set(t.name, fac.id);
    for (const [cat, [taban, kind]] of Object.entries(t.lines) as [CategoryCode, [number, SeasonKind]][]) {
      for (const { year, month } of MONTHS) {
        const yearIdx = year - 2024 + (month - 7) / 12;
        const improve = Math.pow(0.97, Math.max(0, yearIdx));
        const amount = Math.round(jitter(taban * season[kind](month) * improve));
        if (amount <= 0) continue;
        const status = year === LAST.year && month === LAST.month ? "TASLAK" : "ONAYLI";
        bankaRows.push({
          facilityId: fac.id, year, month, category: cat, amount,
          unit: categoryMeta(cat).unit, status,
          documentRef: `KB-${year}${String(month).padStart(2, "0")}-${fac.id.slice(-4).toUpperCase()}`,
        });
      }
    }
  }
  await prisma.activityData.createMany({ data: bankaRows });

  const bankaSaved = await prisma.activityData.findMany({
    where: { facility: { orgId: banka.id }, status: "ONAYLI" },
    select: { id: true, category: true, amount: true },
  });
  const factorOfCat = (cat: CategoryCode) => DEFAULT_FACTORS.find((f) => f.category === cat)!;
  await prisma.emissionRecord.createMany({
    data: bankaSaved.map((a) => {
      const f = factorOfCat(a.category as CategoryCode);
      return {
        activityDataId: a.id,
        scope: scopeOf(a.category as CategoryCode),
        tCO2e: kgToTons(computeKgCO2e(a.category as CategoryCode, a.amount, f.kgCO2ePerUnit)),
        factorSnapshot: JSON.stringify(f),
        calcVersion: CALC_VERSION,
      };
    }),
  });

  // banka hedefleri — 2025-2031 doğrusal net-sıfır
  const bankaRecRows = await prisma.emissionRecord.findMany({
    where: { activityData: { facility: { orgId: banka.id } } },
    select: { scope: true, tCO2e: true, activityData: { select: { year: true, month: true, category: true } } },
  });
  const bankaEngineRows: EmissionRow[] = bankaRecRows.map((r) => ({
    year: r.activityData.year, month: r.activityData.month,
    category: r.activityData.category as CategoryCode,
    scope: r.scope as 1 | 2 | 3, tCO2e: r.tCO2e,
  }));
  const bankaBaselineAnnual = yearScopeTotals(bankaEngineRows, 2024).total * 2;
  const bankaPath = linearNetZeroPath(2024, bankaBaselineAnnual, 2050);
  await prisma.target.createMany({
    data: Array.from({ length: 7 }, (_, i) => 2025 + i).map((year) => ({
      orgId: banka.id, year, targetTCO2e: Math.round(bankaPath.get(year) ?? 0),
    })),
  });

  // BANKA_REZERV havuzu — bankanın kendi op. ayak izini kapatmak için ayrılmış (portföyle karışmaz)
  const bankaYillikOp = yearScopeTotals(bankaEngineRows, 2025).total * 2; // yaklaşık yıllık
  const rezervHavuz = await prisma.creditPool.create({
    data: {
      bankOrgId: banka.id, projectName: "Banka Rezerv — Çamlıca Ağaçlandırma dilimi",
      poolType: "BANKA_REZERV", projectType: "AGACLANDIRMA",
      standard: "GOLD_STANDARD", vintageYear: 2024,
      totalTCO2e: Math.ceil(bankaYillikOp * 3), // ~3 yıllık kapsama
      availableTCO2e: Math.ceil(bankaYillikOp * 2), // 1 yıllık kısmı mahsup edildi
      reservedTCO2e: 0, bufferPct: 10, qualityRating: "AA", priceTRYPerTon: 950, active: true,
    },
  });
  // rezerv-havuzu üzerinden banka kendi 2025 ayak izini mahsup eden bir işlem+retirement
  const rezervTx = await prisma.creditTransaction.create({
    data: {
      poolId: rezervHavuz.id, bankOrgId: banka.id, buyerOrgId: banka.id,
      amountTCO2e: Math.ceil(bankaYillikOp), priceTRYPerTon: 950, status: "TRANSFER",
      requestNote: "Banka 2025 operasyonel ayak izi öz-mahsup", decisionNote: "rezerv havuzundan otomatik",
    },
  });
  await prisma.creditRetirement.create({
    data: {
      orgId: banka.id, transactionId: rezervTx.id, year: 2025,
      amountTCO2e: Math.ceil(bankaYillikOp), note: "banka öz-mahsup 2025",
    },
  });

  // ── D1: Kleaf Denetim org + kullanıcılar (D2/D3 sayfaları apps/denetim'de) ──
  console.log("→ Kleaf Denetim…");
  const kleaf = await prisma.organization.create({
    data: { name: "Kleaf Denetim", type: "KLEAF", baselineYear: 2024, netZeroYear: 2050 },
  });
  await prisma.user.createMany({
    data: [
      { email: "denetim@kleaf.co", name: "Cansu Aydın", role: "KLEAF_ADMIN", orgId: kleaf.id, passwordHash },
      { email: "denetci@kleaf.co", name: "Mert Öz", role: "KLEAF_DENETCI", orgId: kleaf.id, passwordHash },
    ],
  });

  // ═════════════════════════════════════════════════════════════════════
  // Ek 3 belediye — Ankara, İzmir, Bursa
  // Her birine: birim + tesis + faaliyet + emisyon + hedef + eylem +
  //             mahalle + kullanıcı + banka müşteri hesabı + kredi işlemi
  // ═════════════════════════════════════════════════════════════════════
  console.log("→ ek belediyeler (Ankara, İzmir, Bursa)…");
  type BelPlan = {
    name: string; baselineYear: number; netZeroYear: number; portalAcik: boolean;
    olcek: number; latMerkez: number; lngMerkez: number;
    admin: { email: string; name: string };
    mudurluk: { email: string; name: string; birim: string };
    birimler: string[];
    mahalleler: { name: string; population: number; lat: number; lng: number }[];
    eylemler: { title: string; description: string; budgetTRY: number; targetReductionTCO2e: number; status: string; owner: string; startYear: number; startDate?: string; endDate?: string; riskNote?: string; progressAchieved?: number; progressSpent?: number }[];
    kredi: { poolIdx: number; amount: number; status: string; requestNote: string; decisionNote?: string; retire?: number }[];
    veriGecikmesiAy?: number;
  };
  const belPlans: BelPlan[] = [
    {
      name: "Ankara Büyükşehir Belediyesi", baselineYear: 2024, netZeroYear: 2050, portalAcik: true, olcek: 0.9,
      latMerkez: 39.9334, lngMerkez: 32.8597,
      admin: { email: "ankara@kleaf.co", name: "Elif Tuna" },
      mudurluk: { email: "ankara-cevre@kleaf.co", name: "Cem Ergin", birim: "Çevre Koruma ve Kontrol DB" },
      birimler: ["Çevre Koruma ve Kontrol DB", "Ulaşım DB", "Fen İşleri DB", "Park Bahçe ve Yeşil Alanlar DB", "İtfaiye DB", "Destek Hizmetleri DB", "Su ve Kanalizasyon İdaresi", "Sağlık DB"],
      mahalleler: [
        { name: "Çankaya", population: 908_000, lat: 39.90, lng: 32.86 },
        { name: "Keçiören", population: 950_000, lat: 39.99, lng: 32.86 },
        { name: "Yenimahalle", population: 668_000, lat: 39.96, lng: 32.77 },
        { name: "Mamak", population: 704_000, lat: 39.94, lng: 32.94 },
      ],
      eylemler: [
        { title: "Başkent metro rejeneratif fren", description: "M2 hattı frenleme enerjisi geri kazanımı.", budgetTRY: 180_000_000, targetReductionTCO2e: 6_500, status: "DEVAM_EDIYOR", owner: "Ulaşım DB", startYear: 2025, startDate: "2025-02-01", endDate: "2027-06-30", progressAchieved: 800, progressSpent: 32_000_000 },
        { title: "Kamu bina LED dönüşümü", description: "Merkez binaları %100 LED aydınlatma.", budgetTRY: 45_000_000, targetReductionTCO2e: 1_800, status: "DEVAM_EDIYOR", owner: "Fen İşleri DB", startYear: 2025, startDate: "2025-05-01", endDate: "2026-12-31" },
        { title: "ASKİ SCADA verimlilik", description: "Su pompa istasyonları frekans invertör.", budgetTRY: 90_000_000, targetReductionTCO2e: 3_400, status: "PLANLANDI", owner: "Su ve Kanalizasyon İdaresi", startYear: 2026, endDate: "2028-12-31", riskNote: "SCADA tedarik gecikebilir" },
        { title: "EGO otobüs filo elektrifikasyonu", description: "150 elektrikli otobüs alımı.", budgetTRY: 220_000_000, targetReductionTCO2e: 4_100, status: "PLANLANDI", owner: "Ulaşım DB", startYear: 2026, endDate: "2028-06-30" },
      ],
      kredi: [
        { poolIdx: 1, amount: 4_000, status: "TRANSFER", requestNote: "2025 filo yakıt telafisi", retire: 2_500 },
        { poolIdx: 2, amount: 1_800, status: "TALEP", requestNote: "kamu bina LED artık emisyon" },
        { poolIdx: 0, amount: 2_200, status: "DENETIM_ASKI", requestNote: "başkent metro artık telafisi" },
      ],
      veriGecikmesiAy: 0,
    },
    {
      name: "İzmir Büyükşehir Belediyesi", baselineYear: 2024, netZeroYear: 2045, portalAcik: true, olcek: 0.6,
      latMerkez: 38.4192, lngMerkez: 27.1287,
      admin: { email: "izmir@kleaf.co", name: "Deniz Kılıç" },
      mudurluk: { email: "izmir-cevre@kleaf.co", name: "Bora Yılmaz", birim: "Çevre Koruma ve Kontrol DB" },
      birimler: ["Çevre Koruma ve Kontrol DB", "Ulaşım DB", "Fen İşleri DB", "İZSU", "Park Bahçe ve Yeşil Alanlar DB", "İtfaiye DB"],
      mahalleler: [
        { name: "Konak", population: 340_000, lat: 38.42, lng: 27.13 },
        { name: "Karşıyaka", population: 350_000, lat: 38.46, lng: 27.11 },
        { name: "Bornova", population: 460_000, lat: 38.47, lng: 27.22 },
      ],
      eylemler: [
        { title: "Sahil güneş enerjisi programı", description: "Belediye tesislerinde çatı GES kurulumu.", budgetTRY: 60_000_000, targetReductionTCO2e: 2_400, status: "DEVAM_EDIYOR", owner: "Fen İşleri DB", startYear: 2025, startDate: "2025-03-01", endDate: "2027-03-31", progressAchieved: 500, progressSpent: 15_000_000 },
        { title: "İZBAN rejeneratif fren", description: "Banliyö raylı sisteminde geri kazanım.", budgetTRY: 110_000_000, targetReductionTCO2e: 3_200, status: "DEVAM_EDIYOR", owner: "Ulaşım DB", startYear: 2025, startDate: "2025-06-01", endDate: "2027-12-31" },
        { title: "İZSU su kaybı azaltma", description: "SCADA + akıllı sayaç ile su/enerji tasarrufu.", budgetTRY: 75_000_000, targetReductionTCO2e: 2_100, status: "PLANLANDI", owner: "İZSU", startYear: 2026 },
      ],
      kredi: [
        { poolIdx: 1, amount: 2_500, status: "TRANSFER", requestNote: "GES ara-dönem telafisi", retire: 1_800 },
        { poolIdx: 2, amount: 950, status: "BANKA_ONAY", requestNote: "İZSU pompa istasyonu artık emisyon" },
      ],
      veriGecikmesiAy: 2,
    },
    {
      name: "Bursa Büyükşehir Belediyesi", baselineYear: 2024, netZeroYear: 2050, portalAcik: false, olcek: 0.4,
      latMerkez: 40.1885, lngMerkez: 29.0610,
      admin: { email: "bursa@kleaf.co", name: "Zeynep Balcı" },
      mudurluk: { email: "bursa-cevre@kleaf.co", name: "Umut Erdoğan", birim: "Çevre Koruma ve Kontrol DB" },
      birimler: ["Çevre Koruma ve Kontrol DB", "Ulaşım DB", "Fen İşleri DB", "BUSKİ", "Park Bahçe ve Yeşil Alanlar DB"],
      mahalleler: [
        { name: "Osmangazi", population: 900_000, lat: 40.20, lng: 29.06 },
        { name: "Nilüfer", population: 500_000, lat: 40.22, lng: 28.99 },
      ],
      eylemler: [
        { title: "Bursaray hat elektrik verimliliği", description: "Bursa metrosunda LED ve rejeneratif fren.", budgetTRY: 80_000_000, targetReductionTCO2e: 2_600, status: "DEVAM_EDIYOR", owner: "Ulaşım DB", startYear: 2025, startDate: "2025-04-01", endDate: "2027-06-30", progressAchieved: 300, progressSpent: 10_000_000 },
        { title: "BUSKİ enerji verimliliği", description: "Su pompa istasyonları invertör dönüşümü.", budgetTRY: 40_000_000, targetReductionTCO2e: 1_400, status: "PLANLANDI", owner: "BUSKİ", startYear: 2026 },
        { title: "Kamu bina yalıtım programı", description: "Merkez binaları ısı yalıtımı.", budgetTRY: 55_000_000, targetReductionTCO2e: 1_900, status: "PLANLANDI", owner: "Fen İşleri DB", startYear: 2026 },
      ],
      kredi: [
        { poolIdx: 2, amount: 1_500, status: "TRANSFER", requestNote: "2025 kamu bina artık emisyon", retire: 1_200 },
        { poolIdx: 0, amount: 5_500, status: "RED", requestNote: "büyük hacim ön alım", decisionNote: "havuz kapasitesinin üzerinde" },
      ],
      veriGecikmesiAy: 4,
    },
  ];

  const BEL_TABAN: Record<string, [number, SeasonKind]> = {
    ELEKTRIK: [38_000, "cooling"], DOGALGAZ: [6_800, "heating"], DIZEL: [2_600, "flat"],
    BENZIN: [780, "flat"], JENERATOR_DIZEL: [220, "flat"], SOGUTUCU_GAZ: [12, "cooling"],
  };

  const belOrgs: { orgId: string; name: string; adminId: string; mudurlukId: string; kredi: BelPlan["kredi"]; olcek: number; adminEmail: string }[] = [];
  for (const plan of belPlans) {
    console.log(`  · ${plan.name}…`);
    const belOrg = await prisma.organization.create({
      data: { name: plan.name, type: "BELEDIYE", baselineYear: plan.baselineYear, netZeroYear: plan.netZeroYear, portalAcik: plan.portalAcik },
    });
    const belUnitMap = new Map<string, string>();
    const belFacIds: string[] = [];
    for (let i = 0; i < plan.birimler.length; i++) {
      const b = plan.birimler[i];
      const unit = await prisma.unit.create({ data: { name: b, orgId: belOrg.id } });
      belUnitMap.set(b, unit.id);
      const fac = await prisma.facility.create({
        data: {
          name: `${b} Hizmet Binası`, type: "BINA", orgId: belOrg.id, unitId: unit.id,
          areaM2: Math.round(jitter(3_000 + i * 900, 0.15)),
          staffCount: Math.round(jitter(80 + i * 40, 0.2)),
          lat: plan.latMerkez + ((i % 3) - 1) * 0.02, lng: plan.lngMerkez + Math.floor(i / 3) * 0.025,
        },
      });
      belFacIds.push(fac.id);
    }

    // faaliyet + emisyon
    const belRows: { facilityId: string; year: number; month: number; category: CategoryCode; amount: number; unit: string; status: string; documentRef: string }[] = [];
    for (const facilityId of belFacIds) {
      for (const [cat, [taban, kind]] of Object.entries(BEL_TABAN) as [CategoryCode, [number, SeasonKind]][]) {
        for (const { year, month } of MONTHS) {
          const yearIdx = year - 2024 + (month - 7) / 12;
          const improve = Math.pow(0.97, Math.max(0, yearIdx));
          const amount = Math.round(jitter(taban * plan.olcek * season[kind](month) * improve));
          if (amount <= 0) continue;
          const monthsFromEnd = (LAST.year - year) * 12 + (LAST.month - month);
          const status = monthsFromEnd < (plan.veriGecikmesiAy ?? 0) + 1 ? "TASLAK" : "ONAYLI";
          belRows.push({
            facilityId, year, month, category: cat, amount,
            unit: categoryMeta(cat).unit, status,
            documentRef: `${plan.name.slice(0, 3).toUpperCase()}-${year}${String(month).padStart(2, "0")}-${facilityId.slice(-4).toUpperCase()}`,
          });
        }
      }
    }
    await prisma.activityData.createMany({ data: belRows });
    const belSaved = await prisma.activityData.findMany({
      where: { facility: { orgId: belOrg.id }, status: "ONAYLI" },
      select: { id: true, category: true, amount: true },
    });
    await prisma.emissionRecord.createMany({
      data: belSaved.map((a) => {
        const f = factorOfCat(a.category as CategoryCode);
        return {
          activityDataId: a.id,
          scope: scopeOf(a.category as CategoryCode),
          tCO2e: kgToTons(computeKgCO2e(a.category as CategoryCode, a.amount, f.kgCO2ePerUnit)),
          factorSnapshot: JSON.stringify(f),
          calcVersion: CALC_VERSION,
        };
      }),
    });

    // baseline & hedef
    const belRecRows = await prisma.emissionRecord.findMany({
      where: { activityData: { facility: { orgId: belOrg.id } } },
      select: { scope: true, tCO2e: true, activityData: { select: { year: true, month: true, category: true } } },
    });
    const belEngineRows: EmissionRow[] = belRecRows.map((r) => ({
      year: r.activityData.year, month: r.activityData.month,
      category: r.activityData.category as CategoryCode,
      scope: r.scope as 1 | 2 | 3, tCO2e: r.tCO2e,
    }));
    const baselineAnnual = yearScopeTotals(belEngineRows, plan.baselineYear).total * 2;
    const path = linearNetZeroPath(plan.baselineYear, baselineAnnual, plan.netZeroYear);
    await prisma.target.createMany({
      data: Array.from({ length: 7 }, (_, i) => plan.baselineYear + 1 + i).map((year) => ({
        orgId: belOrg.id, year, targetTCO2e: Math.round(path.get(year) ?? 0),
      })),
    });

    // eylem planları + progress
    for (const a of plan.eylemler) {
      const ap = await prisma.actionPlan.create({
        data: {
          orgId: belOrg.id, title: a.title, description: a.description, budgetTRY: a.budgetTRY,
          targetReductionTCO2e: a.targetReductionTCO2e, status: a.status, owner: a.owner, startYear: a.startYear,
          unitId: belUnitMap.get(a.owner) ?? null,
          startDate: a.startDate ? new Date(a.startDate) : null,
          endDate: a.endDate ? new Date(a.endDate) : null,
          riskNote: a.riskNote ?? null,
        },
      });
      if (a.progressAchieved) {
        await prisma.actionProgress.create({
          data: { actionPlanId: ap.id, note: "ilk faz tamamlandı", achievedTCO2e: a.progressAchieved, spentTRY: a.progressSpent ?? 0 },
        });
      }
    }

    // mahalleler
    await prisma.neighborhood.createMany({
      data: plan.mahalleler.map((n) => ({ orgId: belOrg.id, name: n.name, population: n.population, lat: n.lat, lng: n.lng })),
    });

    // kullanıcılar (admin + müdürlük)
    const admin = await prisma.user.create({
      data: { email: plan.admin.email, name: plan.admin.name, role: "IKLIM_MERKEZI", orgId: belOrg.id, passwordHash },
    });
    const mudurluk = await prisma.user.create({
      data: {
        email: plan.mudurluk.email, name: plan.mudurluk.name, role: "MUDURLUK_VERI",
        orgId: belOrg.id, unitId: belUnitMap.get(plan.mudurluk.birim) ?? null, passwordHash,
      },
    });

    // banka müşteri hesabı
    await prisma.clientAccount.create({
      data: {
        bankOrgId: banka.id, clientOrgId: belOrg.id, segment: "BELEDIYE",
        creditLimitTRY: Math.round(30_000_000 * plan.olcek),
        balanceTCO2e: Math.round(2_000 * plan.olcek), status: "AKTIF",
      },
    });

    belOrgs.push({ orgId: belOrg.id, name: plan.name, adminId: admin.id, mudurlukId: mudurluk.id, kredi: plan.kredi, olcek: plan.olcek, adminEmail: plan.admin.email });
  }

  // ── kredi işlemleri (belediye × plan) ──
  console.log("  · kredi işlemleri…");
  const yeniTxIds: { txId: string; orgId: string; status: string; poolIdx: number }[] = [];
  for (const b of belOrgs) {
    for (const k of b.kredi) {
      const pool = await prisma.creditPool.findUniqueOrThrow({ where: { id: poolIds[k.poolIdx] } });
      const gercekDurum = k.status === "DENETIM_ASKI" ? "DENETIM_ASKI" : k.status;
      const askiOnce = k.status === "DENETIM_ASKI" ? "TRANSFER" : null;
      const havuzDus = k.status === "TRANSFER" || k.status === "DENETIM_ASKI";
      const tx = await prisma.creditTransaction.create({
        data: {
          poolId: pool.id, bankOrgId: banka.id, buyerOrgId: b.orgId,
          amountTCO2e: k.amount, priceTRYPerTon: pool.priceTRYPerTon,
          status: gercekDurum, askiOncesiStatus: askiOnce,
          requestNote: k.requestNote, decisionNote: k.decisionNote ?? null,
        },
      });
      if (havuzDus) {
        await prisma.creditPool.update({ where: { id: pool.id }, data: { availableTCO2e: { decrement: k.amount } } });
      }
      if (k.retire) {
        await prisma.creditRetirement.create({
          data: { orgId: b.orgId, transactionId: tx.id, year: 2025, amountTCO2e: k.retire, note: `${k.retire} tCO₂e mahsup — 2025` },
        });
      }
      yeniTxIds.push({ txId: tx.id, orgId: b.orgId, status: k.status, poolIdx: k.poolIdx });
    }
  }

  // ═══════════════════════════════════════════════════════
  // ComplianceFlag × 8 (5 açık + 3 çözülü)
  // ═══════════════════════════════════════════════════════
  console.log("→ uyum bayrakları…");
  const kleafDenetci = await prisma.user.findUniqueOrThrow({ where: { email: "denetci@kleaf.co" } });
  const ankaraOrg = belOrgs[0], izmirOrg = belOrgs[1], bursaOrg = belOrgs[2];
  const ankaraAskiTx = yeniTxIds.find((x) => x.orgId === ankaraOrg.orgId && x.status === "DENETIM_ASKI")!;
  const izmirOnayTx = yeniTxIds.find((x) => x.orgId === izmirOrg.orgId && x.status === "BANKA_ONAY")!;
  const bursaRedTx = yeniTxIds.find((x) => x.orgId === bursaOrg.orgId && x.status === "RED")!;
  const ibbTransferTxId = txIds[0]; // İBB'nin ilk TRANSFER'ı

  const bayraklar = [
    { transactionId: ankaraAskiTx.txId, orgId: ankaraOrg.orgId, tur: "FIYAT_ANOMALI", onem: "YUKSEK",
      aciklama: "İşlem fiyatı 30 günlük ortalamanın %35 üzerinde (GOLD_STANDARD havuzu).", durum: "ACIK" },
    { transactionId: null, orgId: banka.id, tur: "BUFFER_ALTI", onem: "YUKSEK",
      aciklama: "Balıkesir Rüzgâr Enerjisi havuzu tampon oranı %2 — eşik değerin (%5) altında.", durum: "ACIK" },
    { transactionId: null, orgId: banka.id, tur: "BUFFER_ALTI", onem: "ORTA",
      aciklama: "Çamlıca Ağaçlandırma havuzu kalan kapasite toplamın %5 altına düştü.", durum: "ACIK" },
    { transactionId: null, orgId: bursaOrg.orgId, tur: "ASIRI_YOGUNLASMA", onem: "ORTA",
      aciklama: "Bursa BB tüm alımını tek bankadan gerçekleştiriyor — konsantrasyon riski.", durum: "ACIK" },
    { transactionId: izmirOnayTx.txId, orgId: izmirOrg.orgId, tur: "BRUT_ASIM", onem: "DUSUK",
      aciklama: "Talep edilen mahsup, İzmir 2025 hedef fazlasını %8 aşıyor.", durum: "ACIK" },
    { transactionId: ibbTransferTxId, orgId: ibb.id, tur: "CIFTE_SAYIM", onem: "YUKSEK",
      aciklama: "Aynı transferden hem 2025 hem 2026 mahsup yazıldı — çifte sayım riski.", durum: "COZULDU",
      cozumNotu: "İki farklı yıla kısmi mahsup olduğu doğrulandı, mükerrer değil.", cozenId: kleafDenetci.id },
    { transactionId: null, orgId: ibb.id, tur: "BRUT_ASIM", onem: "ORTA",
      aciklama: "Metro elektrik verimliliği eylem planı hedef değerinden %20 sapma gösterdi.", durum: "COZULDU",
      cozumNotu: "Revize hedef onaylandı.", cozenId: kleafDenetci.id },
    { transactionId: null, orgId: banka.id, tur: "FIYAT_ANOMALI", onem: "DUSUK",
      aciklama: "ULUSAL standart havuzunda Şubat işlemi ortalamadan %12 sapma gösterdi.", durum: "COZULDU",
      cozumNotu: "Piyasa hareketi mevcut — kabul edildi.", cozenId: kleafDenetci.id },
  ];
  for (const b of bayraklar) await prisma.complianceFlag.create({ data: b });

  // ═══════════════════════════════════════════════════════
  // AuditDecision × 6
  // ═══════════════════════════════════════════════════════
  console.log("→ denetim kararları…");
  const ankaraTransferTx = yeniTxIds.find((x) => x.orgId === ankaraOrg.orgId && x.status === "TRANSFER")!;
  const kararlar = [
    { transactionId: ankaraAskiTx.txId, karar: "ASKI", not: "FIYAT_ANOMALI bayrağı nedeniyle işlem askıya alındı." },
    { transactionId: ibbTransferTxId, karar: "ONAY", not: "Çifte sayım bayrağı incelendi ve reddedildi." },
    { transactionId: txIds[1], karar: "ONAY", not: "Filo telafi mahsubu belge ile doğrulandı." },
    { transactionId: izmirOnayTx.txId, karar: "ITIRAZ", not: "Brüt aşım net değil; belgeler eksik." },
    { transactionId: bursaRedTx.txId, karar: "ONAY", not: "Bankanın red kararı desteklendi." },
    { transactionId: ankaraTransferTx.txId, karar: "ONAY", not: "Rutin kontrol — bulguya rastlanmadı." },
  ];
  await prisma.auditDecision.createMany({
    data: kararlar.map((k) => ({ ...k, denetciId: kleafDenetci.id })),
  });

  // ═══════════════════════════════════════════════════════
  // AuditLog × ~42 — farklı user, tarih, action
  // ═══════════════════════════════════════════════════════
  console.log("→ denetim izi…");
  const kleafAdminUser = await prisma.user.findUniqueOrThrow({ where: { email: "denetim@kleaf.co" } });
  const bankaAdminUser = await prisma.user.findUniqueOrThrow({ where: { email: "banka@kleaf.co" } });
  const ibbAdminUser = await prisma.user.findUniqueOrThrow({ where: { email: "ibb@kleaf.co" } });
  const logUsers = [
    { id: kleafDenetci.id, email: "denetci@kleaf.co" },
    { id: kleafAdminUser.id, email: "denetim@kleaf.co" },
    { id: bankaAdminUser.id, email: "banka@kleaf.co" },
    { id: ibbAdminUser.id, email: "ibb@kleaf.co" },
    { id: (await prisma.user.findUniqueOrThrow({ where: { email: "ankara@kleaf.co" } })).id, email: "ankara@kleaf.co" },
    { id: (await prisma.user.findUniqueOrThrow({ where: { email: "izmir@kleaf.co" } })).id, email: "izmir@kleaf.co" },
    { id: (await prisma.user.findUniqueOrThrow({ where: { email: "bursa@kleaf.co" } })).id, email: "bursa@kleaf.co" },
  ];
  const actionCatalog: [string, string, string][] = [
    ["GIRIS", "User", "başarılı giriş"],
    ["VERI_OLUSTUR", "ActivityData", "yeni faaliyet kaydı"],
    ["VERI_ONAY", "ActivityData", "müdürlük onayı"],
    ["KREDI_TALEP", "CreditTransaction", "kredi talebi oluşturuldu"],
    ["KREDI_ONAY", "CreditTransaction", "banka onayı"],
    ["KREDI_TRANSFER", "CreditTransaction", "transfer tamamlandı"],
    ["KREDI_ASKI", "CreditTransaction", "işlem askıya alındı"],
    ["BAYRAK_COZ", "ComplianceFlag", "bayrak çözüldü"],
    ["KULLANICI_EKLE", "User", "yeni kullanıcı eklendi"],
    ["EYLEM_GUNCELLE", "ActionPlan", "eylem planı ilerlemesi"],
    ["RAPOR_INDIR", "Report", "uyum raporu PDF indirildi"],
  ];
  const logs = [] as { userId: string; actorEmail: string; action: string; entity: string; entityId: null; detail: string; createdAt: Date }[];
  for (let i = 0; i < 42; i++) {
    const u = logUsers[i % logUsers.length];
    const [action, entity, detail] = actionCatalog[i % actionCatalog.length];
    const daysAgo = i * 2 + (i % 3);
    logs.push({
      userId: u.id, actorEmail: u.email, action, entity, entityId: null, detail,
      createdAt: new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000),
    });
  }
  await prisma.auditLog.createMany({ data: logs });

  const c = {
    kalem: await prisma.inventoryItem.count(),
    veri: await prisma.activityData.count({ where: { facility: { orgId: ibb.id } } }),
    bankaVeri: await prisma.activityData.count({ where: { facility: { orgId: banka.id } } }),
    izleme: await prisma.inventoryEntry.count(),
    havuz: await prisma.creditPool.count(),
    islem: await prisma.creditTransaction.count(),
    kullanici: await prisma.user.count(),
    org: await prisma.organization.count(),
    bayrak: await prisma.complianceFlag.count(),
    karar: await prisma.auditDecision.count(),
    izKaydi: await prisma.auditLog.count(),
  };
  console.log(`✓ tam seed — ${c.org} kurum, ${c.kullanici} kullanıcı, ${c.kalem} kalem, ${c.veri} İBB kaydı, ${c.bankaVeri} banka kaydı, ${c.havuz} havuz, ${c.islem} işlem, ${c.bayrak} bayrak, ${c.karar} karar, ${c.izKaydi} audit log`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
