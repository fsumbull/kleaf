/* kleaf — alan sabitleri: kategori/rol/durum sözlükleri (TR etiketler tek yerde) */

export const CATEGORY_CODES = [
  "ELEKTRIK", "DOGALGAZ", "DIZEL", "BENZIN", "LPG", "CNG", "KOMUR", "JENERATOR_DIZEL",
  "ATIK", "GERI_DONUSUM", "KOMPOST", "SU", "ARAC_KM", "GES_URETIM", "GES_SATIS", "UCUS_KM",
  "ATIKSU_DEBI", "ARITMA_ENERJI", "CAMUR", "ATIKSU_METAN", "RUZGAR_URETIM", "BIYOGAZ_URETIM",
] as const;
export type CategoryCode = (typeof CATEGORY_CODES)[number];

export interface CategoryMeta {
  code: CategoryCode;
  label: string;
  unit: string;
  scope: 1 | 2 | 3;
  /** true → emisyon mahsubu (negatif kayıt) */
  credit?: boolean;
  /** true → envantere girmez, yalnız bilgi amaçlı izlenir (ör. şebekeye satış) */
  infoOnly?: boolean;
}

/** Scope eşlemesi — GHG Protocol / ISO 14064-1:
 *  S1: sabit yakma + kurum araçları · S2: satın alınan elektrik (location-based, GES mahsuplu) · S3: diğer dolaylı */
export const CATEGORIES: readonly CategoryMeta[] = [
  { code: "ELEKTRIK",        label: "elektrik",             unit: "kWh",       scope: 2 },
  { code: "GES_URETIM",      label: "GES üretimi (öz tüketim)", unit: "kWh",   scope: 2, credit: true },
  { code: "GES_SATIS",       label: "GES şebekeye satış",   unit: "kWh",       scope: 2, infoOnly: true },
  { code: "DOGALGAZ",        label: "doğalgaz",             unit: "m³",        scope: 1 },
  { code: "DIZEL",           label: "dizel",                unit: "L",         scope: 1 },
  { code: "BENZIN",          label: "benzin",               unit: "L",         scope: 1 },
  { code: "LPG",             label: "LPG",                  unit: "L",         scope: 1 },
  { code: "CNG",             label: "CNG",                  unit: "m³",        scope: 1 },
  { code: "KOMUR",           label: "kömür (linyit)",       unit: "kg",        scope: 1 },
  { code: "JENERATOR_DIZEL", label: "jeneratör (dizel)",    unit: "L",         scope: 1 },
  { code: "ARAC_KM",         label: "araç kilometresi",     unit: "km",        scope: 1 },
  { code: "ATIK",            label: "atık (depolama)",      unit: "ton",       scope: 3 },
  { code: "GERI_DONUSUM",    label: "geri dönüşüm",         unit: "ton",       scope: 3, credit: true },
  { code: "KOMPOST",         label: "kompost",              unit: "ton",       scope: 3, credit: true },
  { code: "SU",              label: "su tüketimi",          unit: "m³",        scope: 3 },
  { code: "UCUS_KM",         label: "uçuş",                 unit: "yolcu-km",  scope: 3 },
  // atıksu arıtma (M10)
  { code: "ATIKSU_DEBI",     label: "atıksu debisi (arıtma)", unit: "m³",      scope: 3 },
  { code: "ARITMA_ENERJI",   label: "arıtma tesisi elektriği", unit: "kWh",    scope: 2 },
  { code: "CAMUR",           label: "arıtma çamuru (bertaraf)", unit: "ton",   scope: 3 },
  { code: "ATIKSU_METAN",    label: "atıksu metan/N₂O (CO₂e)", unit: "kgCO2e", scope: 1 },
  // yenilenebilir (M11)
  { code: "RUZGAR_URETIM",   label: "rüzgâr üretimi (öz tüketim)", unit: "kWh", scope: 2, credit: true },
  { code: "BIYOGAZ_URETIM",  label: "biyogaz üretimi (öz tüketim)", unit: "kWh", scope: 2, credit: true },
] as const;

export const categoryMeta = (code: string): CategoryMeta => {
  const m = CATEGORIES.find((c) => c.code === code);
  if (!m) throw new Error(`Bilinmeyen kategori: ${code}`);
  return m;
};

export const ROLES = [
  "SUPER_ADMIN",
  "UST_YONETIM",
  "IKLIM_MERKEZI",
  "MUDURLUK_VERI",
  "MUDURLUK_ONAY",
  "ENERJI_YONETICISI",
  "FILO_YONETICISI",
  "ATIK_UZMANI",
  "CBS_UZMANI",
  "MALI_HIZMETLER",
  "SISTEM_YONETICISI",
] as const;
export type Role = (typeof ROLES)[number];
export const ROLE_LABELS: Record<Role, string> = {
  SUPER_ADMIN: "süper admin",
  UST_YONETIM: "üst yönetim",
  IKLIM_MERKEZI: "iklim merkezi",
  MUDURLUK_VERI: "müdürlük veri sorumlusu",
  MUDURLUK_ONAY: "müdürlük onaycısı",
  ENERJI_YONETICISI: "enerji yöneticisi",
  FILO_YONETICISI: "filo yöneticisi",
  ATIK_UZMANI: "atık/atıksu uzmanı",
  CBS_UZMANI: "CBS uzmanı",
  MALI_HIZMETLER: "mali hizmetler",
  SISTEM_YONETICISI: "sistem yöneticisi",
};

export const ORG_TYPES = ["BELEDIYE"] as const;
export type OrgType = (typeof ORG_TYPES)[number];
export const ORG_TYPE_LABELS: Record<OrgType, { product: string; label: string }> = {
  BELEDIYE: { product: "KarbonKent Kurumsal", label: "belediye" },
};

export const FACILITY_TYPES = ["BINA", "KAMPUS", "TESIS", "ARAC_FILOSU", "AYDINLATMA", "GES"] as const;
export type FacilityType = (typeof FACILITY_TYPES)[number];
export const FACILITY_TYPE_LABELS: Record<FacilityType, string> = {
  BINA: "bina", KAMPUS: "kampüs", TESIS: "tesis",
  ARAC_FILOSU: "araç filosu", AYDINLATMA: "aydınlatma", GES: "güneş santrali",
};

export const DATA_STATUS = ["TASLAK", "MUDURLUK_ONAYLI", "ONAYLI"] as const;
export type DataStatus = (typeof DATA_STATUS)[number];
export const DATA_STATUS_LABELS: Record<DataStatus, string> = {
  TASLAK: "taslak", MUDURLUK_ONAYLI: "müdürlük onaylı", ONAYLI: "onaylı",
};

export const ACTION_STATUS = ["PLANLANDI", "DEVAM_EDIYOR", "TAMAMLANDI"] as const;
export type ActionStatus = (typeof ACTION_STATUS)[number];
export const ACTION_STATUS_LABELS: Record<ActionStatus, string> = {
  PLANLANDI: "planlandı", DEVAM_EDIYOR: "devam ediyor", TAMAMLANDI: "tamamlandı",
};

export const MONTHS_TR = [
  "ocak", "şubat", "mart", "nisan", "mayıs", "haziran",
  "temmuz", "ağustos", "eylül", "ekim", "kasım", "aralık",
] as const;

export const VEHICLE_TYPES = ["BINEK", "KAMYONET", "KAMYON", "OTOBUS", "IS_MAKINESI", "MOTOSIKLET"] as const;
export type VehicleType = (typeof VEHICLE_TYPES)[number];
export const VEHICLE_TYPE_LABELS: Record<VehicleType, string> = {
  BINEK: "binek", KAMYONET: "kamyonet", KAMYON: "kamyon",
  OTOBUS: "otobüs", IS_MAKINESI: "iş makinesi", MOTOSIKLET: "motosiklet",
};

export const FUEL_TYPES = ["DIZEL", "BENZIN", "LPG", "CNG", "ELEKTRIK"] as const;
export type FuelType = (typeof FUEL_TYPES)[number];
export const FUEL_TYPE_LABELS: Record<FuelType, string> = {
  DIZEL: "dizel", BENZIN: "benzin", LPG: "LPG", CNG: "CNG", ELEKTRIK: "elektrik",
};

/** Kent ölçeği envanter sektörleri (GPC BASIC sadeleştirmesi) */
export const CITY_SECTORS = ["KONUT", "TICARET", "KAMU_BINA", "ULASIM", "ATIK", "ATIKSU", "ENERJI"] as const;
export type CitySector = (typeof CITY_SECTORS)[number];
export const CITY_SECTOR_LABELS: Record<CitySector, string> = {
  KONUT: "konut", TICARET: "ticaret ve hizmet", KAMU_BINA: "kamu binaları",
  ULASIM: "ulaşım", ATIK: "katı atık", ATIKSU: "atıksu", ENERJI: "enerji üretimi",
};

export const SCOPE_LABELS: Record<1 | 2 | 3, string> = {
  1: "Kapsam 1 — doğrudan",
  2: "Kapsam 2 — enerji dolaylı",
  3: "Kapsam 3 — diğer dolaylı",
};
