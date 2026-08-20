/* kleaf — varsayılan (küresel) emisyon faktörü kütüphanesi.
 * Kaynaklar:
 *  - Elektrik: TEİAŞ 2023 Türkiye şebeke emisyon faktörü (location-based) ≈ 0.442 kgCO2e/kWh
 *  - Yakıtlar: IPCC 2006 Cilt 2 varsayılan NKD + emisyon faktörleri, DEFRA 2024 dönüşümleri
 *  - Atık: düzenli depolama (metan dahil, CH4 GWP100=28, AR5) ≈ 580 kgCO2e/ton
 *  - Su: şebeke suyu temin + arıtma (DEFRA) ≈ 0.344 kgCO2e/m³
 *  - Araç km: ortalama binek/hafif ticari karma filo ≈ 0.192 kgCO2e/km (DEFRA 2024)
 *  - Uçuş: kısa/orta menzil ortalaması ≈ 0.15 kgCO2e/yolcu-km (DEFRA 2024, RF hariç)
 *  - GES üretimi: şebekeden ikame edilen elektrik — TEİAŞ faktörüyle Scope 2'den mahsup edilir
 */
import type { CategoryCode } from "../constants";

export interface FactorDef {
  category: CategoryCode;
  unit: string;
  kgCO2ePerUnit: number;
  source: string;
  year: number;
  scope: 1 | 2 | 3;
}

export const DEFAULT_FACTORS: readonly FactorDef[] = [
  { category: "ELEKTRIK",   unit: "kWh",      kgCO2ePerUnit: 0.442, source: "TEİAŞ 2023 — Türkiye şebeke emisyon faktörü", year: 2023, scope: 2 },
  { category: "GES_URETIM", unit: "kWh",      kgCO2ePerUnit: 0.442, source: "TEİAŞ 2023 — şebekeden ikame (Scope 2 mahsup)", year: 2023, scope: 2 },
  { category: "DOGALGAZ",   unit: "m³",       kgCO2ePerUnit: 2.02,  source: "IPCC 2006 / DEFRA — doğalgaz sabit yakma", year: 2024, scope: 1 },
  { category: "DIZEL",      unit: "L",        kgCO2ePerUnit: 2.68,  source: "IPCC 2006 / DEFRA — motorin", year: 2024, scope: 1 },
  { category: "BENZIN",     unit: "L",        kgCO2ePerUnit: 2.31,  source: "IPCC 2006 / DEFRA — benzin", year: 2024, scope: 1 },
  { category: "LPG",        unit: "L",        kgCO2ePerUnit: 1.56,  source: "IPCC 2006 / DEFRA — LPG", year: 2024, scope: 1 },
  { category: "KOMUR",      unit: "kg",       kgCO2ePerUnit: 1.08,  source: "IPCC 2006 — linyit sabit yakma", year: 2024, scope: 1 },
  { category: "ARAC_KM",    unit: "km",       kgCO2ePerUnit: 0.192, source: "DEFRA 2024 — ortalama karma filo", year: 2024, scope: 1 },
  { category: "ATIK",       unit: "ton",      kgCO2ePerUnit: 580,   source: "DEFRA 2024 — düzenli depolama (CH4 GWP100=28)", year: 2024, scope: 3 },
  { category: "SU",         unit: "m³",       kgCO2ePerUnit: 0.344, source: "DEFRA 2024 — su temini + atıksu arıtma", year: 2024, scope: 3 },
  { category: "UCUS_KM",    unit: "yolcu-km", kgCO2ePerUnit: 0.15,  source: "DEFRA 2024 — kısa/orta menzil ortalama", year: 2024, scope: 3 },
  { category: "CNG",        unit: "m³",       kgCO2ePerUnit: 1.9,   source: "IPCC 2006 / DEFRA — sıkıştırılmış doğalgaz (araç)", year: 2024, scope: 1 },
  { category: "JENERATOR_DIZEL", unit: "L",   kgCO2ePerUnit: 2.68,  source: "IPCC 2006 / DEFRA — dizel jeneratör (sabit yakma)", year: 2024, scope: 1 },
  { category: "GERI_DONUSUM", unit: "ton",    kgCO2ePerUnit: 460,   source: "DEFRA 2024 — depolamadan geri dönüşüme saptırma (mahsup)", year: 2024, scope: 3 },
  { category: "KOMPOST",    unit: "ton",      kgCO2ePerUnit: 420,   source: "DEFRA 2024 — organik atığın komposta saptırılması (mahsup)", year: 2024, scope: 3 },
  { category: "GES_SATIS",  unit: "kWh",      kgCO2ePerUnit: 0.442, source: "TEİAŞ 2023 — şebekeye satış (bilgi amaçlı, envanter dışı)", year: 2023, scope: 2 },
  { category: "ATIKSU_DEBI",   unit: "m³",     kgCO2ePerUnit: 0.272, source: "DEFRA 2024 — atıksu arıtma (m³ başına)", year: 2024, scope: 3 },
  { category: "ARITMA_ENERJI", unit: "kWh",    kgCO2ePerUnit: 0.442, source: "TEİAŞ 2023 — arıtma tesisi şebeke elektriği", year: 2023, scope: 2 },
  { category: "CAMUR",         unit: "ton",    kgCO2ePerUnit: 250,   source: "IPCC 2019 — arıtma çamuru bertarafı (depolama)", year: 2024, scope: 3 },
  { category: "ATIKSU_METAN",  unit: "kgCO2e", kgCO2ePerUnit: 1,     source: "IPCC 2019 — arıtma prosesi CH4/N2O (doğrudan CO2e girişi)", year: 2024, scope: 1 },
  { category: "RUZGAR_URETIM", unit: "kWh",    kgCO2ePerUnit: 0.442, source: "TEİAŞ 2023 — şebekeden ikame, rüzgâr öz tüketimi (mahsup)", year: 2023, scope: 2 },
  { category: "BIYOGAZ_URETIM", unit: "kWh",   kgCO2ePerUnit: 0.442, source: "TEİAŞ 2023 — şebekeden ikame, biyogaz öz tüketimi (mahsup)", year: 2023, scope: 2 },
  { category: "SOGUTUCU_GAZ", unit: "kg",      kgCO2ePerUnit: 2088,  source: "IPCC AR5 — R-410A ortalama GWP100 (soğutucu gaz kaçağı)", year: 2024, scope: 1 },
] as const;
