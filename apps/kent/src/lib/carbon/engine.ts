/* kleaf karbon hesap motoru — saf TypeScript, UI/veritabanından bağımsız.
 *
 * Kurallar (GHG Protocol / ISO 14064-1):
 *  - emisyon (kgCO2e) = miktar × faktör
 *  - Kapsam 1: doğalgaz, dizel, benzin, LPG, kömür, araç km (sabit yakma + kurum araçları)
 *  - Kapsam 2: elektrik (location-based). GES üretimi negatif kayıtla mahsup edilir;
 *    aylık Kapsam 2 toplamı hiçbir zaman 0'ın altına inmez.
 *  - Kapsam 3: atık, su, uçuş.
 */
import { categoryMeta, type CategoryCode } from "../constants";

export const CALC_VERSION = "1.1.0";

/* ── temel hesap ── */

export interface FactorLike {
  kgCO2ePerUnit: number;
  unit: string;
  source: string;
  year: number;
  scope: number;
}

/** Tek faaliyet kaydının emisyonu (kgCO2e). Mahsup kategorileri negatif döner; bilgi amaçlı kategoriler (ör. GES satış) 0 döner. */
export function computeKgCO2e(category: CategoryCode, amount: number, factorKgPerUnit: number): number {
  if (!Number.isFinite(amount) || amount < 0) throw new Error("Miktar negatif veya geçersiz olamaz");
  if (!Number.isFinite(factorKgPerUnit) || factorKgPerUnit < 0) throw new Error("Faktör negatif veya geçersiz olamaz");
  const meta = categoryMeta(category);
  if (meta.infoOnly) return 0; // envantere girmez
  const kg = amount * factorKgPerUnit;
  return meta.credit ? -kg : kg;
}

export const kgToTons = (kg: number): number => kg / 1000;

export function scopeOf(category: CategoryCode): 1 | 2 | 3 {
  return categoryMeta(category).scope;
}

/* ── agregasyon ── */

/** Motorun beklediği hafif kayıt biçimi (EmissionRecord + bağlam) */
export interface EmissionRow {
  year: number;
  month: number; // 1-12
  category: CategoryCode;
  scope: 1 | 2 | 3;
  tCO2e: number; // GES mahsubu negatif
  facilityId?: string;
  unitId?: string | null;
}

export interface ScopeTotals { s1: number; s2: number; s3: number; total: number }

const emptyScopes = (): ScopeTotals => ({ s1: 0, s2: 0, s3: 0, total: 0 });

/** Aylık kapsam toplamları — Kapsam 2 ay bazında 0'da kırpılır (GES mahsubu fazlası yok sayılır). */
export function monthlyScopeTotals(rows: EmissionRow[]): Map<string, ScopeTotals> {
  const map = new Map<string, ScopeTotals>();
  for (const r of rows) {
    const key = `${r.year}-${String(r.month).padStart(2, "0")}`;
    const t = map.get(key) ?? emptyScopes();
    if (r.scope === 1) t.s1 += r.tCO2e;
    else if (r.scope === 2) t.s2 += r.tCO2e;
    else t.s3 += r.tCO2e;
    map.set(key, t);
  }
  for (const t of map.values()) {
    t.s2 = Math.max(0, t.s2); // mahsup kırpması
    t.total = t.s1 + t.s2 + t.s3;
  }
  return map;
}

/** Belirli yılın kapsam toplamları (aylık kırpma uygulanmış). */
export function yearScopeTotals(rows: EmissionRow[], year: number): ScopeTotals {
  const monthly = monthlyScopeTotals(rows.filter((r) => r.year === year));
  const acc = emptyScopes();
  for (const t of monthly.values()) { acc.s1 += t.s1; acc.s2 += t.s2; acc.s3 += t.s3; }
  acc.total = acc.s1 + acc.s2 + acc.s3;
  return acc;
}

/** Yıl → toplam tCO2e (tüm yıllar). */
export function totalsByYear(rows: EmissionRow[]): Map<number, number> {
  const years = [...new Set(rows.map((r) => r.year))];
  const out = new Map<number, number>();
  for (const y of years) out.set(y, yearScopeTotals(rows, y).total);
  return out;
}

/** Kategori bazında toplam (mahsup negatif olarak görünür — şeffaflık için). */
export function totalsByCategory(rows: EmissionRow[]): Map<CategoryCode, number> {
  const out = new Map<CategoryCode, number>();
  for (const r of rows) out.set(r.category, (out.get(r.category) ?? 0) + r.tCO2e);
  return out;
}

/** Tesis bazında toplam (aylık S2 kırpması tesis içinde uygulanır). */
export function totalsByFacility(rows: EmissionRow[]): Map<string, number> {
  const byFac = new Map<string, EmissionRow[]>();
  for (const r of rows) {
    if (!r.facilityId) continue;
    const list = byFac.get(r.facilityId) ?? [];
    list.push(r);
    byFac.set(r.facilityId, list);
  }
  const out = new Map<string, number>();
  for (const [fid, list] of byFac) {
    let sum = 0;
    for (const t of monthlyScopeTotals(list).values()) sum += t.total;
    out.set(fid, sum);
  }
  return out;
}

/* ── göstergeler ── */

/** Önceki yıla göre değişim yüzdesi; önceki yıl 0/yok ise null. */
export function yoyChangePct(rows: EmissionRow[], year: number): number | null {
  const cur = yearScopeTotals(rows, year).total;
  const prev = yearScopeTotals(rows, year - 1).total;
  if (prev <= 0) return null;
  return ((cur - prev) / prev) * 100;
}

/** Yoğunluk: kişi başı / m² başı tCO2e. */
export const intensity = (totalTCO2e: number, denominator: number | null | undefined): number | null =>
  denominator && denominator > 0 ? totalTCO2e / denominator : null;

/** Hedef sapması: pozitif → hedefin ÜZERİNDE (kötü). */
export function targetGapPct(actualTCO2e: number, targetTCO2e: number): number | null {
  if (targetTCO2e <= 0) return null;
  return ((actualTCO2e - targetTCO2e) / targetTCO2e) * 100;
}

/* ── patika ve projeksiyon ── */

/** Baz yıldan net-sıfır yılına doğrusal azalım patikası: yıl → hedef tCO2e. */
export function linearNetZeroPath(baselineYear: number, baselineTCO2e: number, netZeroYear: number): Map<number, number> {
  const out = new Map<number, number>();
  const span = netZeroYear - baselineYear;
  if (span <= 0) { out.set(netZeroYear, 0); return out; }
  for (let y = baselineYear; y <= netZeroYear; y++) {
    out.set(y, baselineTCO2e * (1 - (y - baselineYear) / span));
  }
  return out;
}

/** Basit doğrusal eğilim (en küçük kareler) projeksiyonu: geçmiş yıl toplamlarından ileriye. */
export function trendProjection(yearTotals: Map<number, number>, toYear: number): Map<number, number> {
  const pts = [...yearTotals.entries()].filter(([, v]) => v > 0).sort((a, b) => a[0] - b[0]);
  const out = new Map<number, number>();
  if (pts.length === 0) return out;
  if (pts.length === 1) {
    for (let y = pts[0][0]; y <= toYear; y++) out.set(y, pts[0][1]);
    return out;
  }
  const n = pts.length;
  const sx = pts.reduce((a, [x]) => a + x, 0);
  const sy = pts.reduce((a, [, y]) => a + y, 0);
  const sxx = pts.reduce((a, [x]) => a + x * x, 0);
  const sxy = pts.reduce((a, [x, y]) => a + x * y, 0);
  const denom = n * sxx - sx * sx;
  const slope = denom === 0 ? 0 : (n * sxy - sx * sy) / denom;
  const icept = (sy - slope * sx) / n;
  for (let y = pts[0][0]; y <= toYear; y++) {
    out.set(y, Math.max(0, slope * y + icept));
  }
  return out;
}

/* ── mevsimsel tahmin (forecast) ── */

export interface AylikNokta { year: number; month: number; tCO2e: number }

/**
 * Mevsimsel indeks + doğrusal eğilim ile aylık ileri tahmin.
 * Son 24 (veya eldeki) aylık noktadan trend çıkarır, ay bazlı mevsimsellik oranlarını
 * normalize edip ileriye uygular. 4'ten az nokta varsa ortalamayı düz uzatır.
 */
export function seasonalForecast(series: AylikNokta[], months = 12): AylikNokta[] {
  const pts = [...series]
    .sort((a, b) => a.year - b.year || a.month - b.month)
    .slice(-24);
  if (pts.length === 0 || months <= 0) return [];

  const ileriAylar: { year: number; month: number }[] = [];
  let { year: y, month: m } = pts[pts.length - 1];
  for (let k = 0; k < months; k++) {
    m += 1;
    if (m > 12) { m = 1; y += 1; }
    ileriAylar.push({ year: y, month: m });
  }

  const n = pts.length;
  if (n < 4) {
    const ort = pts.reduce((a, p) => a + p.tCO2e, 0) / n;
    return ileriAylar.map((a) => ({ ...a, tCO2e: Math.max(0, ort) }));
  }

  // doğrusal eğilim: t (0..n-1) → tCO2e
  const sx = (n * (n - 1)) / 2;
  const sxx = pts.reduce((a, _, t) => a + t * t, 0);
  const sy = pts.reduce((a, p) => a + p.tCO2e, 0);
  const sxy = pts.reduce((a, p, t) => a + t * p.tCO2e, 0);
  const denom = n * sxx - sx * sx;
  const slope = denom === 0 ? 0 : (n * sxy - sx * sy) / denom;
  const icept = (sy - slope * sx) / n;
  const trend = (t: number) => slope * t + icept;

  // ay bazlı mevsimsel indeks: gözlem / trend oranlarının ortalaması, ortalaması 1'e normalize
  const oranlar = new Map<number, number[]>();
  pts.forEach((p, t) => {
    const tr = trend(t);
    if (tr > 0) {
      const list = oranlar.get(p.month) ?? [];
      list.push(p.tCO2e / tr);
      oranlar.set(p.month, list);
    }
  });
  const indeks = new Map<number, number>();
  for (let ay = 1; ay <= 12; ay++) {
    const list = oranlar.get(ay);
    indeks.set(ay, list && list.length ? list.reduce((a, v) => a + v, 0) / list.length : 1);
  }
  const indeksOrt = [...indeks.values()].reduce((a, v) => a + v, 0) / 12;
  if (indeksOrt > 0) for (const [ay, v] of indeks) indeks.set(ay, v / indeksOrt);

  return ileriAylar.map((a, k) => ({
    ...a,
    tCO2e: Math.max(0, trend(n + k) * (indeks.get(a.month) ?? 1)),
  }));
}

/** Yıl sonu tahmini: gerçekleşen ayların toplamı + kalan ayların mevsimsel tahmini. */
export function yilSonuTahmini(series: AylikNokta[], year: number): {
  gerceklesen: number; tahminKalan: number; yilSonu: number; gerceklesenAy: number;
} | null {
  const yilNoktalari = series.filter((p) => p.year === year);
  if (yilNoktalari.length === 0) return null;
  const sonAy = Math.max(...yilNoktalari.map((p) => p.month));
  const gerceklesen = yilNoktalari.reduce((a, p) => a + p.tCO2e, 0);
  if (sonAy >= 12) return { gerceklesen, tahminKalan: 0, yilSonu: gerceklesen, gerceklesenAy: sonAy };
  const gecmis = series.filter((p) => p.year < year || (p.year === year && p.month <= sonAy));
  const tahmin = seasonalForecast(gecmis, 12 - sonAy);
  const tahminKalan = tahmin
    .filter((p) => p.year === year)
    .reduce((a, p) => a + p.tCO2e, 0);
  return { gerceklesen, tahminKalan, yilSonu: gerceklesen + tahminKalan, gerceklesenAy: sonAy };
}

/* ── senaryo motoru ── */

export interface ScenarioParams {
  gesKwp: number;                 // eklenecek GES kurulu gücü (kWp)
  filoElektrifikasyonPct: number; // 0-100
  binaVerimlilikPct: number;      // 0-100 — genel bina enerji verimliliği
  /* v2 kaldıraçları (isteğe bağlı — eski senaryolarla geriye uyumlu) */
  ledDonusumPct?: number;         // sokak aydınlatması LED dönüşümü (0-100)
  yalitimPct?: number;            // bina yalıtım programı kapsamı (0-100)
  kazanPct?: number;              // verimli kazan/ısı pompası dönüşümü (0-100)
  kompostSaptirmaPct?: number;    // organik atığın komposta saptırılması (0-100)
  ayristirmaArtisiPct?: number;   // geri dönüşüm ayrıştırma artışı (0-100)
  topluTasimaPct?: number;        // filo yakıtını azaltan toplu taşıma/rota optimizasyonu (0-100)
}

export interface ScenarioContext {
  elektrikFaktoru: number;    // kgCO2e/kWh
  filoTCO2e: number;          // yıllık araç yakıtı + km emisyonu
  binaEnerjiTCO2e: number;    // yıllık elektrik + doğalgaz emisyonu (binalar)
  /* v2 bağlamı (isteğe bağlı) */
  aydinlatmaKwh?: number;     // yıllık sokak aydınlatması elektriği (kWh)
  dogalgazTCO2e?: number;     // yıllık doğalgaz emisyonu (yalıtım/kazan tabanı)
  atikTon?: number;           // yıllık depolanan atık (ton)
  /* birim fiyat / faktör (₺ tasarrufu için) */
  elektrikFiyatiTRY?: number; // ₺/kWh
  dogalgazFiyatiTRY?: number; // ₺/m³
  dizelFiyatiTRY?: number;    // ₺/L
  atikBertarafTRY?: number;   // ₺/ton
  dogalgazFaktoru?: number;   // kgCO2e/m³ (vars. 2.02)
  dizelFaktoru?: number;      // kgCO2e/L (vars. 2.68)
  gesKwhPerKwp?: number;      // bölgesel yıllık özgül üretim (vars. 1350 kWh/kWp)
}

/** Türkiye ortalaması: 1 kWp GES ≈ 1350 kWh/yıl üretim. */
export const GES_KWH_PER_KWP_YIL = 1350;
/** Elektrikli araç, fosil filoya göre net ~%70 azaltım sağlar (şebeke faktörü dahil). */
export const FILO_EV_NET_AZALTIM = 0.7;
/** LED dönüşümü armatür başına ~%55 tüketim azaltır. */
export const LED_TASARRUF_ORANI = 0.55;
/** Dış cephe yalıtımı ısıtma gazını ~%25 azaltır. */
export const YALITIM_TASARRUF_ORANI = 0.25;
/** Yoğuşmalı kazan / ısı pompası dönüşümü ~%12 gaz tasarrufu. */
export const KAZAN_TASARRUF_ORANI = 0.12;
/** Belediye atığının organik oranı (TÜİK ortalaması ≈ %45). */
export const ORGANIK_ATIK_ORANI = 0.45;
/** Depolamadan komposta saptırılan her ton ≈ 0.42 tCO2e net azaltım. */
export const KOMPOST_AZALTIM_T_PER_TON = 0.42;
/** Depolamadan geri dönüşüme saptırılan her ton ≈ 0.46 tCO2e net azaltım. */
export const AYRISTIRMA_AZALTIM_T_PER_TON = 0.46;
/** Doğalgaz alt ısıl değeri ≈ 10.64 kWh/m³. */
export const GAZ_KWH_PER_M3 = 10.64;
/** Linyit ≈ 4.8 kWh/kg (NKD). */
export const KOMUR_KWH_PER_KG = 4.8;
/** Anahtar teslim GES yatırım maliyeti ≈ 28.000 ₺/kWp (2026). */
export const GES_CAPEX_TRY_PER_KWP = 28_000;
/** Şebekeye satış tarifesi ≈ 1.8 ₺/kWh (YEKDEM sonrası ortalama). */
export const GES_SATIS_TARIFE_TRY = 1.8;
/** EV dönüşümünde yakıt maliyetinin ~%60'ı net tasarruf (elektrik gideri düşülmüş). */
export const EV_YAKIT_MALIYET_TASARRUFU = 0.6;
/** Filo dönüşüm öncelik katsayıları — yüksek karbon yoğunluğu önce dönüştürülür. */
export const FUEL_PRIORITY_COEF: Record<string, number> = {
  DIZEL: 1, BENZIN: 0.9, LPG: 0.8, CNG: 0.7, ELEKTRIK: 0,
};

export interface ScenarioSavings {
  ges: number; filo: number; bina: number;
  led: number; yalitim: number; kazan: number;
  kompost: number; ayristirma: number; topluTasima: number;
  toplam: number;
}

/** İki kaldıracın toplamını tabana kırpar; oran koruyarak ölçekler. */
function clampPair(a: number, b: number, cap: number): [number, number] {
  const sum = a + b;
  if (sum <= cap || sum <= 0) return [a, b];
  const k = cap / sum;
  return [a * k, b * k];
}

/** Senaryonun yıllık azaltım potansiyeli (tCO2e/yıl) — kaldıraç kırılımıyla.
 *  Çifte sayım korumaları: yalıtım+kazan ≤ doğalgaz tabanı; filo EV + toplu taşıma ≤ filo tabanı. */
export function scenarioAnnualSavings(p: ScenarioParams, ctx: ScenarioContext): ScenarioSavings {
  const pct = (v: number | undefined) => Math.min(100, Math.max(0, v ?? 0)) / 100;

  const ges = kgToTons(p.gesKwp * (ctx.gesKwhPerKwp ?? GES_KWH_PER_KWP_YIL) * ctx.elektrikFaktoru);
  const bina = ctx.binaEnerjiTCO2e * pct(p.binaVerimlilikPct);
  const led = kgToTons((ctx.aydinlatmaKwh ?? 0) * pct(p.ledDonusumPct) * LED_TASARRUF_ORANI * ctx.elektrikFaktoru);

  const gazTaban = ctx.dogalgazTCO2e ?? 0;
  const [yalitim, kazan] = clampPair(
    gazTaban * pct(p.yalitimPct) * YALITIM_TASARRUF_ORANI,
    gazTaban * pct(p.kazanPct) * KAZAN_TASARRUF_ORANI,
    gazTaban
  );

  const [filo, topluTasima] = clampPair(
    ctx.filoTCO2e * pct(p.filoElektrifikasyonPct) * FILO_EV_NET_AZALTIM,
    ctx.filoTCO2e * pct(p.topluTasimaPct),
    ctx.filoTCO2e
  );

  const atikTaban = ctx.atikTon ?? 0;
  const kompost = atikTaban * ORGANIK_ATIK_ORANI * pct(p.kompostSaptirmaPct) * KOMPOST_AZALTIM_T_PER_TON;
  const ayristirma = atikTaban * (1 - ORGANIK_ATIK_ORANI) * pct(p.ayristirmaArtisiPct) * AYRISTIRMA_AZALTIM_T_PER_TON;

  const toplam = ges + filo + bina + led + yalitim + kazan + kompost + ayristirma + topluTasima;
  return { ges, filo, bina, led, yalitim, kazan, kompost, ayristirma, topluTasima, toplam };
}

export interface ScenarioSavingsTRY {
  ges: number; led: number; gaz: number; filo: number; atik: number; toplam: number;
}

/** Kaldıraçların yıllık ₺ tasarrufu — fiziksel miktarlardan birim fiyatlarla.
 *  Genel "bina verimliliği" kaldıracı karışık enerji türü içerdiğinden ₺ hesabına dahil edilmez. */
export function scenarioAnnualSavingsTRY(p: ScenarioParams, ctx: ScenarioContext): ScenarioSavingsTRY {
  const s = scenarioAnnualSavings(p, ctx);
  const elektrikFiyat = ctx.elektrikFiyatiTRY ?? 0;
  const gazFiyat = ctx.dogalgazFiyatiTRY ?? 0;
  const dizelFiyat = ctx.dizelFiyatiTRY ?? 0;
  const bertaraf = ctx.atikBertarafTRY ?? 0;
  const gazFaktor = ctx.dogalgazFaktoru ?? 2.02;
  const dizelFaktor = ctx.dizelFaktoru ?? 2.68;
  const pct = (v: number | undefined) => Math.min(100, Math.max(0, v ?? 0)) / 100;

  const ges = p.gesKwp * (ctx.gesKwhPerKwp ?? GES_KWH_PER_KWP_YIL) * elektrikFiyat;
  const led = (ctx.aydinlatmaKwh ?? 0) * pct(p.ledDonusumPct) * LED_TASARRUF_ORANI * elektrikFiyat;
  const gazM3 = ((s.yalitim + s.kazan) * 1000) / gazFaktor;
  const gaz = gazM3 * gazFiyat;
  // filo: EV dönüşümü net %60 maliyet tasarrufu; toplu taşıma yakıtı tamamen önler
  const filoL = (s.filo / FILO_EV_NET_AZALTIM) * 1000 / dizelFaktor;
  const topluL = (s.topluTasima * 1000) / dizelFaktor;
  const filo = filoL * dizelFiyat * EV_YAKIT_MALIYET_TASARRUFU + topluL * dizelFiyat;
  const atikTaban = ctx.atikTon ?? 0;
  const saptirilanTon = atikTaban * ORGANIK_ATIK_ORANI * pct(p.kompostSaptirmaPct)
    + atikTaban * (1 - ORGANIK_ATIK_ORANI) * pct(p.ayristirmaArtisiPct);
  const atik = saptirilanTon * bertaraf;
  return { ges, led, gaz, filo, atik, toplam: ges + led + gaz + filo + atik };
}

/** Kısmi yıl yıllıklandırma: n<12 ay veri varsa değeri ×12/n ölçekler. n≤0 → 0. */
export function annualize(value: number, monthsWithData: number): number {
  if (monthsWithData <= 0) return 0;
  if (monthsWithData >= 12) return value;
  return (value * 12) / monthsWithData;
}

/** Senaryo patikası: mevcut gidişattan, 5 yılda devreye giren azaltımı düşerek. */
export function scenarioPath(
  baseTrend: Map<number, number>,
  fromYear: number,
  annualSavings: number,
  rampYears = 5
): Map<number, number> {
  const out = new Map<number, number>();
  for (const [y, v] of baseTrend) {
    if (y < fromYear) { out.set(y, v); continue; }
    const ramp = Math.min(1, (y - fromYear + 1) / rampYears);
    out.set(y, Math.max(0, v - annualSavings * ramp));
  }
  return out;
}

/* ── finansal göstergeler ── */

/** Geri ödeme süresi (yıl). Tasarruf ≤ 0 ise null; yatırım ≤ 0 ise 0. */
export function paybackYears(capexTRY: number, annualSavingTRY: number): number | null {
  if (!Number.isFinite(annualSavingTRY) || annualSavingTRY <= 0) return null;
  if (!Number.isFinite(capexTRY) || capexTRY <= 0) return 0;
  return capexTRY / annualSavingTRY;
}

/** Yatırım öncelik skoru (0-100): azaltım/CAPEX oranı küme içinde normalize edilir.
 *  CAPEX'siz pozitif azaltım → 100 (bedava kazanım). */
export function priorityScores(items: { reductionTCO2e: number; capexTRY: number | null | undefined }[]): number[] {
  const ratios = items.map(({ reductionTCO2e, capexTRY }) => {
    if (reductionTCO2e <= 0) return 0;
    if (!capexTRY || capexTRY <= 0) return Infinity;
    return reductionTCO2e / capexTRY;
  });
  const maxFinite = Math.max(0, ...ratios.filter((r) => Number.isFinite(r)));
  return ratios.map((r) => {
    if (r === Infinity) return 100;
    if (maxFinite <= 0) return 0;
    return Math.min(100, (r / maxFinite) * 100);
  });
}

/* ── GES fizibilite ── */

export interface GesFeasibilityInput {
  kwp: number;
  ozTuketimPct: number;        // üretimin kurum içinde tüketilen payı (0-100)
  capexTRY?: number | null;    // boşsa capexPerKwpTRY × kWp varsayılır
  elektrikFaktoru: number;     // kgCO2e/kWh
  elektrikFiyatiTRY: number;   // ₺/kWh (öz tüketim değeri)
  satisTarifesiTRY?: number;   // ₺/kWh (şebekeye satış, vars. 1.8)
  kwhPerKwp?: number;          // bölgesel özgül üretim (vars. 1350)
  capexPerKwpTRY?: number;     // kurulum birim maliyeti (vars. 28.000 ₺/kWp)
}

export interface GesFeasibilityResult {
  uretimKwh: number;
  ozTuketimKwh: number;
  satisKwh: number;
  azaltimTCO2e: number;   // yalnız öz tüketim envanteri azaltır
  gelirTRY: number;       // öz tüketim tasarrufu + satış geliri
  capexTRY: number;
  geriOdemeYil: number | null;
}

/** GES yatırım fizibilitesi — üretim, azaltım, gelir ve geri ödeme. */
export function gesFeasibility(input: GesFeasibilityInput): GesFeasibilityResult {
  const kwp = Math.max(0, input.kwp);
  const oran = Math.min(100, Math.max(0, input.ozTuketimPct)) / 100;
  const uretimKwh = kwp * (input.kwhPerKwp ?? GES_KWH_PER_KWP_YIL);
  const ozTuketimKwh = uretimKwh * oran;
  const satisKwh = uretimKwh - ozTuketimKwh;
  const azaltimTCO2e = kgToTons(ozTuketimKwh * input.elektrikFaktoru);
  const gelirTRY = ozTuketimKwh * input.elektrikFiyatiTRY + satisKwh * (input.satisTarifesiTRY ?? GES_SATIS_TARIFE_TRY);
  const capexTRY = input.capexTRY && input.capexTRY > 0 ? input.capexTRY : kwp * (input.capexPerKwpTRY ?? GES_CAPEX_TRY_PER_KWP);
  return { uretimKwh, ozTuketimKwh, satisKwh, azaltimTCO2e, gelirTRY, capexTRY, geriOdemeYil: paybackYears(capexTRY, gelirTRY) };
}

/** GES öz tüketim karşılama oranı (%): üretim / (üretim + şebeke). */
export function gesCoverageRatio(gesKwh: number, sebekeKwh: number): number | null {
  const sum = gesKwh + sebekeKwh;
  if (sum <= 0) return null;
  return (gesKwh / sum) * 100;
}

/* ── enerji eşdeğeri (kamu binası takibi) ── */

/** Karma enerji tüketimini kWh eşdeğerine indirger (elektrik + gaz×10.64 + kömür×4.8). */
export function kwhEquivalent(input: { elektrikKwh?: number; dogalgazM3?: number; komurKg?: number }): number {
  return (input.elektrikKwh ?? 0)
    + (input.dogalgazM3 ?? 0) * GAZ_KWH_PER_M3
    + (input.komurKg ?? 0) * KOMUR_KWH_PER_KG;
}

/** Tasarruf hedefi ilerlemesi (%): gerçekleşen azalmanın hedefe oranı. 100 → hedef tutturuldu. */
export function savingsTargetProgress(bazKwhEq: number, cariKwhEq: number, hedefPct: number): number | null {
  if (bazKwhEq <= 0 || hedefPct <= 0) return null;
  const gerceklesen = (bazKwhEq - cariKwhEq) / bazKwhEq;
  return (gerceklesen / (hedefPct / 100)) * 100;
}

/* ── veri kalitesi ── */

export interface Anomaly {
  index: number;        // seri içindeki konum
  value: number;
  median: number;
  deviationPct: number; // medyana göre sapma (%)
  severity: "orta" | "yuksek";
}

/** Sağlam (robust) aykırı değer tespiti — medyan + MAD.
 *  Eşik = max(3 × 1.4826 × MAD, 0.3 × medyan); 2× eşik üstü "yuksek". n<4 → boş. */
export function detectAnomalies(series: number[]): Anomaly[] {
  const n = series.length;
  if (n < 4) return [];
  const sorted = [...series].sort((a, b) => a - b);
  const med = (arr: number[]) => {
    const m = arr.length;
    return m % 2 ? arr[(m - 1) / 2] : (arr[m / 2 - 1] + arr[m / 2]) / 2;
  };
  const m = med(sorted);
  const mad = med(series.map((x) => Math.abs(x - m)).sort((a, b) => a - b));
  const esik = Math.max(3 * 1.4826 * mad, 0.3 * m);
  if (esik <= 0) return [];
  const out: Anomaly[] = [];
  series.forEach((x, i) => {
    const sapma = Math.abs(x - m);
    if (sapma > esik) {
      out.push({
        index: i, value: x, median: m,
        deviationPct: m > 0 ? ((x - m) / m) * 100 : 0,
        severity: sapma > 2 * esik ? "yuksek" : "orta",
      });
    }
  });
  return out;
}

export interface QualityInput {
  beklenenHucre: number; // dönemde beklenen (tesis × kategori) hücre sayısı
  doluHucre: number;     // girilmiş hücre sayısı
  toplamKayit: number;
  onayliKayit: number;
  belgeliKayit: number;  // documentRef dolu
  aykiriKayit: number;   // anomali işaretli
}

export interface QualityScore {
  skor: number;   // 0-100
  tamlik: number; // 0-1
  onay: number;
  belge: number;
  aykiri: number; // 0-1 (oran; skora 1-aykiri olarak girer)
}

/** Veri kalite skoru = 0.4×tamlık + 0.3×onay + 0.2×belge + 0.1×(1−aykırı). Kayıt yoksa null. */
export function qualityScore(q: QualityInput): QualityScore | null {
  if (q.toplamKayit <= 0) return null;
  const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
  const tamlik = q.beklenenHucre > 0 ? clamp01(q.doluHucre / q.beklenenHucre) : 1;
  const onay = clamp01(q.onayliKayit / q.toplamKayit);
  const belge = clamp01(q.belgeliKayit / q.toplamKayit);
  const aykiri = clamp01(q.aykiriKayit / q.toplamKayit);
  const skor = Math.round(100 * (0.4 * tamlik + 0.3 * onay + 0.2 * belge + 0.1 * (1 - aykiri)));
  return { skor, tamlik, onay, belge, aykiri };
}

/* ── filo analitiği ── */

/** Araç dönüşüm öncelik skoru: yıllık emisyon × yakıt katsayısı (dizel önce). */
export function fleetPriorityScore(fuelType: string, annualTCO2e: number): number {
  return Math.max(0, annualTCO2e) * (FUEL_PRIORITY_COEF[fuelType] ?? 1);
}

/* ── atıksu analitiği ── */

export const ATIKSU_KATEGORILER: CategoryCode[] = ["ATIKSU_DEBI", "ARITMA_ENERJI", "CAMUR", "ATIKSU_METAN"];
export const YENILENEBILIR_URETIM_KATEGORILER: CategoryCode[] = ["GES_URETIM", "RUZGAR_URETIM", "BIYOGAZ_URETIM"];

export interface AtiksuDengesi {
  aritmaTCO2e: number;  // arıtma prosesi (debi + enerji + çamur)
  metanTCO2e: number;   // proses kaçak metan (doğrudan CO2e)
  krediTCO2e: number;   // biyogaz üretimi mahsubu (pozitif büyüklük)
  netTCO2e: number;     // arıtma + metan − kredi
}

/** Atıksu emisyon dengesi — arıtma prosesi + metan − biyogaz kredisi.
 * rows: EmissionRecord temelli {category, tCO2e} (krediler negatif tCO2e ile gelir). */
export function atiksuDengesi(rows: { category: CategoryCode; tCO2e: number }[]): AtiksuDengesi {
  const d: AtiksuDengesi = { aritmaTCO2e: 0, metanTCO2e: 0, krediTCO2e: 0, netTCO2e: 0 };
  for (const r of rows) {
    if (r.category === "ATIKSU_METAN") d.metanTCO2e += r.tCO2e;
    else if (r.category === "BIYOGAZ_URETIM") d.krediTCO2e += Math.abs(r.tCO2e);
    else if ((ATIKSU_KATEGORILER as string[]).includes(r.category)) d.aritmaTCO2e += r.tCO2e;
  }
  d.netTCO2e = d.aritmaTCO2e + d.metanTCO2e - d.krediTCO2e;
  return d;
}

/** Arıtılan m³ başına emisyon yoğunluğu (kgCO2e/m³). Debi 0 ise null. */
export function aritmaYogunlugu(netTCO2e: number, debiM3: number): number | null {
  if (!Number.isFinite(debiM3) || debiM3 <= 0) return null;
  return (netTCO2e * 1000) / debiM3;
}
