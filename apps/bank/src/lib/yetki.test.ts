/* Rol erişim matrisi testleri — KarbonKent Kurumsal */
import { describe, it, expect } from "vitest";
import {
  MERKEZ_ROLLER, SISTEM_ROLLER, DENETIM_ROLLER, VERI_GIRIS_ROLLER,
  MERKEZ_ONAY_ROLLER, MUDURLUK_ONAY_ROLLER, PLAN_YONETIM_ROLLER,
  SENARYO_ROLLER, AYAR_ROLLER, kategoriYetkisi, birimKisitli, sayfaYetkisi,
} from "./yetki";
import { ROLES, type Role } from "./constants";

describe("rol listeleri", () => {
  it("tüm listelerdeki roller tanımlı ROLES içinde", () => {
    for (const list of [MERKEZ_ROLLER, SISTEM_ROLLER, DENETIM_ROLLER, VERI_GIRIS_ROLLER, MERKEZ_ONAY_ROLLER, MUDURLUK_ONAY_ROLLER, PLAN_YONETIM_ROLLER, SENARYO_ROLLER, AYAR_ROLLER]) {
      for (const r of list) expect(ROLES).toContain(r);
    }
  });
  it("üst yönetim hiçbir yazma listesinde yok", () => {
    for (const list of [VERI_GIRIS_ROLLER, MERKEZ_ONAY_ROLLER, PLAN_YONETIM_ROLLER, SENARYO_ROLLER, AYAR_ROLLER, SISTEM_ROLLER]) {
      expect(list).not.toContain("UST_YONETIM");
    }
  });
  it("müdürlük onaycısı yalnız ara onay verir, merkez onayı veremez", () => {
    expect(MUDURLUK_ONAY_ROLLER).toEqual(["MUDURLUK_ONAY"]);
    expect(MERKEZ_ONAY_ROLLER).not.toContain("MUDURLUK_ONAY");
  });
});

describe("kategoriYetkisi", () => {
  it("iklim merkezi her kategoriye girebilir", () => {
    expect(kategoriYetkisi("IKLIM_MERKEZI", "ELEKTRIK")).toBe(true);
    expect(kategoriYetkisi("IKLIM_MERKEZI", "CAMUR")).toBe(true);
  });
  it("enerji yöneticisi yalnız enerji kategorileri", () => {
    expect(kategoriYetkisi("ENERJI_YONETICISI", "ELEKTRIK")).toBe(true);
    expect(kategoriYetkisi("ENERJI_YONETICISI", "RUZGAR_URETIM")).toBe(true);
    expect(kategoriYetkisi("ENERJI_YONETICISI", "DIZEL")).toBe(false);
    expect(kategoriYetkisi("ENERJI_YONETICISI", "ATIK")).toBe(false);
  });
  it("filo yöneticisi yalnız yakıt/km", () => {
    expect(kategoriYetkisi("FILO_YONETICISI", "DIZEL")).toBe(true);
    expect(kategoriYetkisi("FILO_YONETICISI", "ARAC_KM")).toBe(true);
    expect(kategoriYetkisi("FILO_YONETICISI", "ELEKTRIK")).toBe(false);
  });
  it("atık uzmanı atık + atıksu kategorileri", () => {
    expect(kategoriYetkisi("ATIK_UZMANI", "ATIKSU_DEBI")).toBe(true);
    expect(kategoriYetkisi("ATIK_UZMANI", "ATIKSU_METAN")).toBe(true);
    expect(kategoriYetkisi("ATIK_UZMANI", "BENZIN")).toBe(false);
  });
  it("üst yönetim ve CBS hiçbir kategoriye giremez", () => {
    expect(kategoriYetkisi("UST_YONETIM", "ELEKTRIK")).toBe(false);
    expect(kategoriYetkisi("CBS_UZMANI", "SU")).toBe(false);
  });
});

describe("birimKisitli", () => {
  it("müdürlük rolleri birim kısıtlı, diğerleri değil", () => {
    expect(birimKisitli("MUDURLUK_VERI")).toBe(true);
    expect(birimKisitli("MUDURLUK_ONAY")).toBe(true);
    expect(birimKisitli("IKLIM_MERKEZI")).toBe(false);
    expect(birimKisitli("SUPER_ADMIN")).toBe(false);
  });
});

describe("sayfaYetkisi", () => {
  it("herkese açık sayfalar tüm roller için erişilebilir", () => {
    for (const r of ROLES) expect(sayfaYetkisi(r as Role, "/")).toBe(true);
  });
  it("kullanıcı yönetimi yalnız sistem rolleri", () => {
    expect(sayfaYetkisi("SISTEM_YONETICISI", "/kullanicilar")).toBe(true);
    expect(sayfaYetkisi("SUPER_ADMIN", "/kullanicilar")).toBe(true);
    expect(sayfaYetkisi("IKLIM_MERKEZI", "/kullanicilar")).toBe(false);
    expect(sayfaYetkisi("UST_YONETIM", "/kullanicilar")).toBe(false);
  });
  it("kurumlar yalnız süper admin", () => {
    for (const r of ROLES.filter((x) => x !== "SUPER_ADMIN")) {
      expect(sayfaYetkisi(r as Role, "/kurumlar")).toBe(false);
    }
  });
  it("dönem yönetimi merkez + müdürlük onay", () => {
    expect(sayfaYetkisi("IKLIM_MERKEZI", "/donem")).toBe(true);
    expect(sayfaYetkisi("MUDURLUK_ONAY", "/donem")).toBe(true);
    expect(sayfaYetkisi("FILO_YONETICISI", "/donem")).toBe(false);
  });
  it("ayarlar yalnız merkez", () => {
    expect(sayfaYetkisi("IKLIM_MERKEZI", "/ayarlar")).toBe(true);
    expect(sayfaYetkisi("SISTEM_YONETICISI", "/ayarlar")).toBe(false);
  });
});
