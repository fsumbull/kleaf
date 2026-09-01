/* KarbonKent Kurumsal — rol yetki matrisi (tek doğruluk kaynağı)
 * Sayfa erişimi, API rol listeleri ve alan (domain) kısıtları burada tanımlıdır. */
import type { Role, CategoryCode } from "./constants";

/** Merkez yönetim — envanter, metodoloji, onay, eylem planı tam yetki */
export const MERKEZ_ROLLER: Role[] = ["SUPER_ADMIN", "IKLIM_MERKEZI"];

/** Kullanıcı/sistem yönetimi */
export const SISTEM_ROLLER: Role[] = ["SUPER_ADMIN", "SISTEM_YONETICISI"];

/** Denetim izini görebilenler */
export const DENETIM_ROLLER: Role[] = ["SUPER_ADMIN", "SISTEM_YONETICISI", "IKLIM_MERKEZI"];

/** Veri girişi yapabilen roller (alan kısıtı ayrıca uygulanır) */
export const VERI_GIRIS_ROLLER: Role[] = [
  "SUPER_ADMIN", "IKLIM_MERKEZI", "MUDURLUK_VERI",
  "ENERJI_YONETICISI", "FILO_YONETICISI", "ATIK_UZMANI",
];

/** Merkez onayı verebilenler (nihai onay) */
export const MERKEZ_ONAY_ROLLER: Role[] = ["SUPER_ADMIN", "IKLIM_MERKEZI"];

/** Müdürlük ara onayı verebilenler (yalnız kendi birimi) */
export const MUDURLUK_ONAY_ROLLER: Role[] = ["MUDURLUK_ONAY"];

/** Eylem planı / yatırım yönetimi */
export const PLAN_YONETIM_ROLLER: Role[] = ["SUPER_ADMIN", "IKLIM_MERKEZI", "MALI_HIZMETLER"];

/** Senaryo kaydetme */
export const SENARYO_ROLLER: Role[] = ["SUPER_ADMIN", "IKLIM_MERKEZI", "MALI_HIZMETLER", "ENERJI_YONETICISI"];

/** Kurum ayarları / hedefler / faktörler */
export const AYAR_ROLLER: Role[] = ["SUPER_ADMIN", "IKLIM_MERKEZI"];

/** Tesis/araç envanteri yönetimi */
export const ENVANTER_YONETIM_ROLLER: Role[] = ["SUPER_ADMIN", "IKLIM_MERKEZI", "ENERJI_YONETICISI", "FILO_YONETICISI"];

/** Envanter kataloğu yönetimi (kalem ekleme/pasifleştirme/eşleme) */
export const KATALOG_YONETIM_ROLLER: Role[] = ["SUPER_ADMIN", "IKLIM_MERKEZI"];

/** Banka tarafı — havuz CRUD + talep kararı (yalnız KARBON_BANK kurumunda anlamlı) */
export const BANKA_YONETIM_ROLLER: Role[] = ["SUPER_ADMIN", "BANKA_ADMIN"];

/** Banka tarafı — görünüm/analiz */
export const BANKA_GORUNUM_ROLLER: Role[] = ["SUPER_ADMIN", "BANKA_ADMIN", "BANKA_ANALIST"];

/** Belediye tarafı — kredi talebi açma/iptal ve mahsup */
export const KREDI_TALEP_ROLLER: Role[] = ["SUPER_ADMIN", "IKLIM_MERKEZI", "MALI_HIZMETLER"];

/** Kategori alanları — alan uzmanı roller yalnız kendi alanına veri girer */
const ENERJI_KATEGORILER: CategoryCode[] = ["ELEKTRIK", "DOGALGAZ", "KOMUR", "JENERATOR_DIZEL", "GES_URETIM", "GES_SATIS", "RUZGAR_URETIM", "BIYOGAZ_URETIM"];
const FILO_KATEGORILER: CategoryCode[] = ["DIZEL", "BENZIN", "LPG", "CNG", "ARAC_KM"];
const ATIK_KATEGORILER: CategoryCode[] = ["ATIK", "GERI_DONUSUM", "KOMPOST", "SU", "ATIKSU_DEBI", "ARITMA_ENERJI", "CAMUR", "ATIKSU_METAN"];

/** Rol bu kategoriye veri girebilir mi? (unit kısıtından bağımsız alan kontrolü) */
export function kategoriYetkisi(role: Role, category: string): boolean {
  switch (role) {
    case "SUPER_ADMIN":
    case "IKLIM_MERKEZI":
    case "MUDURLUK_VERI": // birim kısıtı ayrıca uygulanır
      return true;
    case "ENERJI_YONETICISI": return (ENERJI_KATEGORILER as string[]).includes(category);
    case "FILO_YONETICISI": return (FILO_KATEGORILER as string[]).includes(category);
    case "ATIK_UZMANI": return (ATIK_KATEGORILER as string[]).includes(category);
    default: return false;
  }
}

/** Rol birim (müdürlük) kapsamına tabi mi? Tabi ise yalnız kendi biriminin tesislerine erişir. */
export function birimKisitli(role: Role): boolean {
  return role === "MUDURLUK_VERI" || role === "MUDURLUK_ONAY";
}

/** Sayfa (route) erişim matrisi — sidebar ve requireSession için */
export const ROUTE_ROLLER: Record<string, Role[] | undefined> = {
  // undefined → tüm oturumlu roller görebilir (salt görüntüleme herkes)
  "/": undefined,
  "/veri-girisi": undefined, // görüntüleme herkese; yazma API'da kısıtlı
  "/veri-kalite": undefined,
  "/gorevler": undefined, // görüntüleme herkese; atama API'da MERKEZ_ROLLER
  "/tesisler": undefined,
  "/binalar": undefined,
  "/filo": undefined,
  "/atik": undefined,
  "/atiksu": undefined,
  "/ges": undefined,
  "/kent": undefined,
  "/harita": undefined,
  "/donem": ["SUPER_ADMIN", "IKLIM_MERKEZI", "MUDURLUK_ONAY"],
  "/eylem-plani": undefined,
  "/senaryolar": undefined,
  "/faktorler": undefined,
  "/raporlar": undefined,
  "/envanter": undefined, // görüntüleme herkese; yazma API'da KATALOG_YONETIM_ROLLER
  "/kiyas": undefined,
  "/karbon-kredi": undefined, // görüntüleme herkese; talep/mahsup API'da KREDI_TALEP_ROLLER
  "/banka": BANKA_GORUNUM_ROLLER,
  "/kurumlar": ["SUPER_ADMIN"],
  "/kullanicilar": SISTEM_ROLLER,
  "/denetim": DENETIM_ROLLER,
  "/ayarlar": AYAR_ROLLER,
  "/entegrasyon": SISTEM_ROLLER,
  "/sistem": ["SUPER_ADMIN"],
};

export function sayfaYetkisi(role: Role, href: string): boolean {
  const allowed = ROUTE_ROLLER[href];
  return !allowed || allowed.includes(role);
}

/** Kurum tipine bağlı sayfalar — listede olmayan sayfa tüm kurum tiplerine açıktır */
export const ROUTE_ORG_TYPES: Record<string, string[] | undefined> = {
  "/banka": ["KARBON_BANK"],
  "/karbon-kredi": ["BELEDIYE"],
  "/kent": ["BELEDIYE"],
  "/harita": ["BELEDIYE"],
  "/gorevler": ["BELEDIYE"],
  "/kiyas": ["BELEDIYE"],
};

export function sayfaKurumYetkisi(orgType: string, href: string): boolean {
  const allowed = ROUTE_ORG_TYPES[href];
  return !allowed || allowed.includes(orgType);
}

/** Yetki matrisi ekranı için yetenek sütunları (tek doğruluk kaynağından türetilir) */
export const YETENEKLER: { key: string; label: string; roller: Role[] }[] = [
  { key: "veri", label: "veri girişi", roller: VERI_GIRIS_ROLLER },
  { key: "merkezOnay", label: "nihai onay", roller: MERKEZ_ONAY_ROLLER },
  { key: "mudurlukOnay", label: "müd. onayı", roller: MUDURLUK_ONAY_ROLLER },
  { key: "envanter", label: "tesis/araç", roller: ENVANTER_YONETIM_ROLLER },
  { key: "plan", label: "eylem planı", roller: PLAN_YONETIM_ROLLER },
  { key: "senaryo", label: "senaryo", roller: SENARYO_ROLLER },
  { key: "ayar", label: "ayarlar", roller: AYAR_ROLLER },
  { key: "kullanici", label: "kullanıcılar", roller: SISTEM_ROLLER },
  { key: "denetim", label: "denetim izi", roller: DENETIM_ROLLER },
];

/** Rolün veri girebildiği kategori alanı etiketi (matris gösterimi için) */
export function kategoriAlani(role: Role): string {
  switch (role) {
    case "SUPER_ADMIN": case "IKLIM_MERKEZI": return "tüm kategoriler";
    case "MUDURLUK_VERI": return "tümü (kendi birimi)";
    case "ENERJI_YONETICISI": return "enerji (elektrik, doğalgaz, GES…)";
    case "FILO_YONETICISI": return "filo (dizel, benzin, km…)";
    case "ATIK_UZMANI": return "atık & su";
    default: return "—";
  }
}
