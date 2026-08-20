import { describe, it, expect } from "vitest";
import { gecisIzinliMi, cuzdanBakiyesi, islemKalani, mahsupGecerliMi, KREDI_GECISLERI } from "./kredi";
import { CREDIT_STATUS, type CreditStatus } from "./constants";

describe("kredi durum makinesi — tam geçiş matrisi", () => {
  it("izinli geçişler: TALEP→BANKA_ONAY(banka), TALEP→RED(banka), TALEP→IPTAL(belediye)", () => {
    expect(gecisIzinliMi("TALEP", "BANKA_ONAY", "BANKA")).toBe(true);
    expect(gecisIzinliMi("TALEP", "RED", "BANKA")).toBe(true);
    expect(gecisIzinliMi("TALEP", "IPTAL", "BELEDIYE")).toBe(true);
  });

  it("izinli geçişler: BANKA_ONAY→TRANSFER(belediye), →RED(banka), →IPTAL(belediye)", () => {
    expect(gecisIzinliMi("BANKA_ONAY", "TRANSFER", "BELEDIYE")).toBe(true);
    expect(gecisIzinliMi("BANKA_ONAY", "RED", "BANKA")).toBe(true);
    expect(gecisIzinliMi("BANKA_ONAY", "IPTAL", "BELEDIYE")).toBe(true);
  });

  it("çift taraf kuralı: hiçbir taraf kendi başına iki adım ilerleyemez", () => {
    // belediye kendi talebini onaylayamaz / transfer'e zıplayamaz
    expect(gecisIzinliMi("TALEP", "BANKA_ONAY", "BELEDIYE")).toBe(false);
    expect(gecisIzinliMi("TALEP", "TRANSFER", "BELEDIYE")).toBe(false);
    // banka onayı verip transferi de kendisi tamamlayamaz
    expect(gecisIzinliMi("BANKA_ONAY", "TRANSFER", "BANKA")).toBe(false);
    // banka talep açamaz (TALEP oluşturma zaten belediye API'sında)
    expect(gecisIzinliMi("TALEP", "TRANSFER", "BANKA")).toBe(false);
  });

  it("nihai durumlardan çıkış yoktur", () => {
    // TRANSFER artık DENETIM_ASKI'ya (KLEAF tarafından) geçebilir — gerçek nihai yalnız RED/IPTAL
    for (const son of ["RED", "IPTAL"] as CreditStatus[]) {
      expect(KREDI_GECISLERI[son]).toHaveLength(0);
      for (const hedef of CREDIT_STATUS) {
        expect(gecisIzinliMi(son, hedef, "BANKA")).toBe(false);
        expect(gecisIzinliMi(son, hedef, "BELEDIYE")).toBe(false);
        expect(gecisIzinliMi(son, hedef, "KLEAF")).toBe(false);
      }
    }
  });

  it("matris dışı tüm kombinasyonlar reddedilir (tam tarama)", () => {
    const izinli = new Set<string>();
    for (const [from, list] of Object.entries(KREDI_GECISLERI))
      for (const g of list) izinli.add(`${from}→${g.hedef}:${g.taraf}`);
    let red = 0;
    for (const from of CREDIT_STATUS)
      for (const to of CREDIT_STATUS)
        for (const taraf of ["BANKA", "BELEDIYE", "KLEAF"] as const) {
          const ok = gecisIzinliMi(from, to, taraf);
          expect(ok).toBe(izinli.has(`${from}→${to}:${taraf}`));
          if (!ok) red++;
        }
    expect(red).toBe(CREDIT_STATUS.length * CREDIT_STATUS.length * 3 - izinli.size);
  });
});

describe("cüzdan matematiği", () => {
  const islemler = [
    { status: "TRANSFER", amountTCO2e: 500 },
    { status: "TRANSFER", amountTCO2e: 250 },
    { status: "BANKA_ONAY", amountTCO2e: 1000 }, // henüz transfer olmadı — sayılmaz
    { status: "RED", amountTCO2e: 300 },
  ];

  it("cüzdan = Σ TRANSFER − Σ mahsup", () => {
    const c = cuzdanBakiyesi(islemler, [{ amountTCO2e: 100 }, { amountTCO2e: 50 }]);
    expect(c.edinilen).toBe(750);
    expect(c.mahsup).toBe(150);
    expect(c.kalan).toBe(600);
  });

  it("bozuk veri durumunda kalan negatife düşmez", () => {
    expect(cuzdanBakiyesi([{ status: "TRANSFER", amountTCO2e: 10 }], [{ amountTCO2e: 99 }]).kalan).toBe(0);
  });

  it("işlem bazlı kalan ve mahsup doğrulaması", () => {
    expect(islemKalani(500, [{ amountTCO2e: 100 }])).toBe(400);
    expect(mahsupGecerliMi(400, 500, [{ amountTCO2e: 100 }]).ok).toBe(true);
    expect(mahsupGecerliMi(401, 500, [{ amountTCO2e: 100 }]).ok).toBe(false);
    expect(mahsupGecerliMi(0, 500, []).ok).toBe(false);
    expect(mahsupGecerliMi(-5, 500, []).ok).toBe(false);
    expect(mahsupGecerliMi(NaN, 500, []).ok).toBe(false);
  });
});

describe("DENETIM_ASKI — kleaf yetki matrisi", () => {
  it("KLEAF her aktif durumdan (TALEP, BANKA_ONAY, TRANSFER) DENETIM_ASKI'ya alabilir", () => {
    expect(gecisIzinliMi("TALEP", "DENETIM_ASKI", "KLEAF")).toBe(true);
    expect(gecisIzinliMi("BANKA_ONAY", "DENETIM_ASKI", "KLEAF")).toBe(true);
    expect(gecisIzinliMi("TRANSFER", "DENETIM_ASKI", "KLEAF")).toBe(true);
  });

  it("KLEAF askıyı çözerken önceki durumlara döndürebilir; BANKA/BELEDIYE bu kararı veremez", () => {
    for (const geri of ["TALEP", "BANKA_ONAY", "TRANSFER"] as const) {
      expect(gecisIzinliMi("DENETIM_ASKI", geri, "KLEAF")).toBe(true);
      expect(gecisIzinliMi("DENETIM_ASKI", geri, "BANKA")).toBe(false);
      expect(gecisIzinliMi("DENETIM_ASKI", geri, "BELEDIYE")).toBe(false);
    }
  });

  it("DENETIM_ASKI RED/IPTAL'e gitmez — askı çözümü aktif akışa iade eder", () => {
    expect(gecisIzinliMi("DENETIM_ASKI", "RED", "KLEAF")).toBe(false);
    expect(gecisIzinliMi("DENETIM_ASKI", "IPTAL", "KLEAF")).toBe(false);
  });
});
