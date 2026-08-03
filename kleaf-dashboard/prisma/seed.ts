/* KarbonKent Kurumsal demo tohum verisi — tek belediye, gerçekçi mevsimsel 24 aylık tüketim (2024-07 → 2026-06).
 * Deterministik LCG ile tekrarlanabilir. Onaylı kayıtlar için EmissionRecord (faktör kopyalı) üretilir. */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { DEFAULT_FACTORS } from "../src/lib/carbon/factors";
import { computeKgCO2e, kgToTons, scopeOf, CALC_VERSION, linearNetZeroPath, yearScopeTotals, type EmissionRow } from "../src/lib/carbon/engine";
import type { CategoryCode } from "../src/lib/constants";
import { categoryMeta } from "../src/lib/constants";

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

const ORGS: OrgPlan[] = [
  {
    name: "Yeşilova Belediyesi", type: "BELEDIYE", baselineYear: 2024,
    units: ["Fen İşleri Müdürlüğü", "Çevre Koruma Müdürlüğü", "Park ve Bahçeler Müdürlüğü", "Su ve Kanalizasyon Müdürlüğü", "Ulaşım Hizmetleri Müdürlüğü", "Bilgi İşlem Müdürlüğü"],
    facilities: [
      { name: "Belediye Hizmet Binası", type: "BINA", areaM2: 8500, staffCount: 420, unit: "Çevre Koruma Müdürlüğü", lat: 39.605, lng: 32.905,
        lines: { ELEKTRIK: [95_000, "cooling"], DOGALGAZ: [14_000, "heating"], SU: [1_800, "flat"], ATIK: [42, "flat"], GERI_DONUSUM: [11, "flat"], KOMPOST: [6, "flat"], UCUS_KM: [6_000, "flat"], JENERATOR_DIZEL: [220, "flat"] } },
      { name: "Ek Hizmet Binası", type: "BINA", areaM2: 3200, staffCount: 140, unit: "Bilgi İşlem Müdürlüğü", lat: 39.612, lng: 32.918,
        lines: { ELEKTRIK: [34_000, "cooling"], DOGALGAZ: [5_200, "heating"], SU: [700, "flat"] } },
      { name: "Hizmet Araçları Filosu", type: "ARAC_FILOSU", unit: "Ulaşım Hizmetleri Müdürlüğü", lat: 39.598, lng: 32.892,
        lines: { DIZEL: [6_500, "flat"], BENZIN: [1_600, "flat"], ARAC_KM: [190_000, "flat"] } },
      { name: "Sokak Aydınlatması", type: "AYDINLATMA", unit: "Fen İşleri Müdürlüğü", lat: 39.607, lng: 32.899,
        lines: { ELEKTRIK: [210_000, "lighting"] } },
      { name: "Atıksu Arıtma Tesisi", type: "TESIS", areaM2: 12_000, staffCount: 45, unit: "Su ve Kanalizasyon Müdürlüğü", lat: 39.582, lng: 32.931,
        lines: { ELEKTRIK: [160_000, "flat"], DOGALGAZ: [1_100, "heating"], ATIKSU_DEBI: [780_000, "flat"], ARITMA_ENERJI: [145_000, "flat"], CAMUR: [310, "flat"], ATIKSU_METAN: [18_000, "flat"], BIYOGAZ_URETIM: [42_000, "flat"] } },
      { name: "Karacaören GES", type: "GES", unit: "Fen İşleri Müdürlüğü", lat: 39.571, lng: 32.868, installedKwp: 850, commissionYear: 2023, capexTRY: 22_000_000,
        lines: { GES_URETIM: [88_000, "solar"], GES_SATIS: [21_000, "solar"] } },
      { name: "Tepebaşı Rüzgar Türbini", type: "TESIS", unit: "Fen İşleri Müdürlüğü", lat: 39.632, lng: 32.851, installedKwp: 1_200, commissionYear: 2024, capexTRY: 48_000_000,
        lines: { RUZGAR_URETIM: [96_000, "lighting"] } },
    ],
    vehicles: [
      { plateNo: "06 YB 101", name: "Çöp kamyonu #1", vehicleType: "KAMYON", fuelType: "DIZEL", modelYear: 2018, facility: "Hizmet Araçları Filosu", lines: { DIZEL: 3_400 } },
      { plateNo: "06 YB 102", name: "Çöp kamyonu #2", vehicleType: "KAMYON", fuelType: "DIZEL", modelYear: 2020, facility: "Hizmet Araçları Filosu", lines: { DIZEL: 3_100 }, spike: [2026, 3, 1.9] },
      { plateNo: "06 YB 205", name: "Yol süpürme aracı", vehicleType: "IS_MAKINESI", fuelType: "DIZEL", modelYear: 2019, facility: "Hizmet Araçları Filosu", lines: { DIZEL: 2_600 } },
      { plateNo: "06 YB 310", name: "Kazıcı yükleyici", vehicleType: "IS_MAKINESI", fuelType: "DIZEL", modelYear: 2016, facility: "Hizmet Araçları Filosu", lines: { DIZEL: 2_900 } },
      { plateNo: "06 YB 411", name: "Zabıta bineği", vehicleType: "BINEK", fuelType: "BENZIN", modelYear: 2021, facility: "Hizmet Araçları Filosu", lines: { BENZIN: 950 } },
      { plateNo: "06 YB 412", name: "Makam aracı", vehicleType: "BINEK", fuelType: "BENZIN", modelYear: 2022, facility: "Hizmet Araçları Filosu", lines: { BENZIN: 780 } },
      { plateNo: "06 YB 520", name: "Park bakım kamyoneti", vehicleType: "KAMYONET", fuelType: "LPG", modelYear: 2017, facility: "Hizmet Araçları Filosu", lines: { LPG: 1_100 } },
      { plateNo: "06 YB 601", name: "Elektrikli hizmet aracı", vehicleType: "BINEK", fuelType: "ELEKTRIK", modelYear: 2025, facility: "Hizmet Araçları Filosu", lines: { ELEKTRIK: 1_050 } },
    ],
    neighborhoods: [
      { name: "Cumhuriyet Mah.", population: 42_000, lat: 39.608, lng: 32.909 },
      { name: "Atatürk Mah.", population: 35_500, lat: 39.615, lng: 32.889 },
      { name: "Yeni Mah.", population: 28_000, lat: 39.594, lng: 32.915 },
      { name: "Bahçelievler Mah.", population: 21_500, lat: 39.589, lng: 32.884 },
      { name: "Sanayi Mah.", population: 9_800, lat: 39.622, lng: 32.933 },
    ],
    cityData: [
      ["KONUT", "ELEKTRIK", 96_000_000], ["KONUT", "DOGALGAZ", 21_000_000],
      ["TICARET", "ELEKTRIK", 54_000_000], ["TICARET", "DOGALGAZ", 6_500_000],
      ["KAMU_BINA", "ELEKTRIK", 8_200_000], ["KAMU_BINA", "DOGALGAZ", 1_900_000],
      ["ULASIM", "DIZEL", 14_500_000], ["ULASIM", "BENZIN", 9_800_000], ["ULASIM", "LPG", 5_200_000],
      ["ATIK", "ATIK", 46_000], ["ATIKSU", "SU", 7_800_000],
    ],
    actions: [
      { title: "LED sokak aydınlatması dönüşümü", description: "38.000 armatürün LED'e dönüşümü; %55 tüketim azaltımı hedefi.", budgetTRY: 18_500_000, targetReductionTCO2e: 1_200, status: "DEVAM_EDIYOR", owner: "Fen İşleri Müdürlüğü", startYear: 2025, startDate: "2025-03-01", endDate: "2027-06-30",
        progress: [
          { note: "1. etap — 14.000 armatür tamamlandı", achievedTCO2e: 420, spentTRY: 6_900_000 },
          { note: "2. etap ihalesi sonuçlandı", achievedTCO2e: 0, spentTRY: 400_000 },
        ] },
      { title: "GES kapasite artışı (+2 MWp)", description: "Karacaören sahasına ek 2 MWp kurulum; yıllık ≈2,7 GWh üretim.", budgetTRY: 62_000_000, targetReductionTCO2e: 1_190, status: "PLANLANDI", owner: "Fen İşleri Müdürlüğü", startYear: 2026, startDate: "2026-09-01", endDate: "2028-03-31", riskNote: "Trafo kapasite tahsisi ve çağrı mektubu süreci gecikebilir." },
      { title: "Filo elektrifikasyonu — 1. etap", description: "Binek araçların %20'sinin elektrikliye dönüşümü ve şarj altyapısı.", budgetTRY: 45_000_000, targetReductionTCO2e: 480, status: "DEVAM_EDIYOR", owner: "Ulaşım Hizmetleri Müdürlüğü", startYear: 2025, startDate: "2025-06-01", endDate: "2026-12-31",
        progress: [{ note: "12 elektrikli araç teslim alındı", achievedTCO2e: 130, spentTRY: 14_200_000 }] },
      { title: "Bina yalıtım ve ısı pompası programı", description: "Hizmet binalarında dış cephe yalıtımı + hava kaynaklı ısı pompası.", budgetTRY: 30_000_000, targetReductionTCO2e: 640, status: "PLANLANDI", owner: "Çevre Koruma Müdürlüğü", startYear: 2026, startDate: "2026-02-01", endDate: "2026-05-31", riskNote: "İhale iptali nedeniyle takvim riski yüksek — yeniden ilan bekleniyor." },
    ],
  },
];

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
    prisma.auditLog.deleteMany(), prisma.emissionRecord.deleteMany(),
    prisma.document.deleteMany(), prisma.activityData.deleteMany(),
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

  /* örnek senaryo (Yeşilova) */
  const yesilova = await prisma.organization.findFirstOrThrow({ where: { name: "Yeşilova Belediyesi" } });
  await prisma.scenario.create({
    data: {
      orgId: yesilova.id, name: "2030 yol haritası",
      params: JSON.stringify({
        gesKwp: 2000, filoElektrifikasyonPct: 30, binaVerimlilikPct: 15,
        ledDonusumPct: 40, yalitimPct: 30, kazanPct: 20,
        kompostSaptirmaPct: 25, ayristirmaArtisiPct: 20, topluTasimaPct: 10,
      }),
    },
  });

  /* kullanıcılar — 11 rol demo hesabı */
  console.log("→ kullanıcılar…");
  const yUnits = await prisma.unit.findMany({ where: { orgId: yesilova.id }, select: { id: true, name: true } });
  const unitId = (name: string) => yUnits.find((u) => u.name === name)?.id ?? null;
  await prisma.user.createMany({
    data: [
      { email: "admin@kleaf.co", name: "kleaf Yönetici", role: "SUPER_ADMIN", orgId: null, passwordHash },
      { email: "demo@yesilova.bel.tr", name: "Defne Yılmaz", role: "IKLIM_MERKEZI", orgId: yesilova.id, passwordHash },
      { email: "veri@yesilova.bel.tr", name: "Mert Kaya", role: "MUDURLUK_VERI", orgId: yesilova.id, unitId: unitId("Fen İşleri Müdürlüğü"), passwordHash },
      { email: "onay@yesilova.bel.tr", name: "Elif Şahin", role: "MUDURLUK_ONAY", orgId: yesilova.id, unitId: unitId("Fen İşleri Müdürlüğü"), passwordHash },
      { email: "izleyici@yesilova.bel.tr", name: "Zeynep Demir", role: "UST_YONETIM", orgId: yesilova.id, passwordHash },
      { email: "enerji@yesilova.bel.tr", name: "Barış Aydoğan", role: "ENERJI_YONETICISI", orgId: yesilova.id, passwordHash },
      { email: "filo@yesilova.bel.tr", name: "Cem Yüksel", role: "FILO_YONETICISI", orgId: yesilova.id, passwordHash },
      { email: "atik@yesilova.bel.tr", name: "Seda Koç", role: "ATIK_UZMANI", orgId: yesilova.id, passwordHash },
      { email: "cbs@yesilova.bel.tr", name: "Onur Er", role: "CBS_UZMANI", orgId: yesilova.id, passwordHash },
      { email: "mali@yesilova.bel.tr", name: "Aylin Taş", role: "MALI_HIZMETLER", orgId: yesilova.id, passwordHash },
      { email: "sistem@yesilova.bel.tr", name: "Kerem Arı", role: "SISTEM_YONETICISI", orgId: yesilova.id, passwordHash },
    ],
  });

  const counts = {
    kayit: await prisma.activityData.count(),
    hesap: await prisma.emissionRecord.count(),
    tesis: await prisma.facility.count(),
  };
  console.log(`✓ tohum tamam — ${counts.tesis} tesis, ${counts.kayit} faaliyet kaydı, ${counts.hesap} hesap izi`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
