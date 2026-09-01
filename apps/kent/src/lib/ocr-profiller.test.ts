/* OCR profil çıkarım testleri — saf fonksiyonlar */
import { describe, it, expect } from "vitest";
import {
  parseTrNumber, donemBul, belgeNoBul, tutarBul, plakaBul, plakaNormalize,
  profilBul, kayitDogrula,
} from "./ocr-profiller";

describe("parseTrNumber", () => {
  it("TR biçimi: 1.234,56 → 1234.56", () => expect(parseTrNumber("1.234,56")).toBeCloseTo(1234.56));
  it("nokta ondalık: 1234.56 → 1234.56", () => expect(parseTrNumber("1234.56")).toBeCloseTo(1234.56));
  it("geçersiz → null", () => expect(parseTrNumber("abc")).toBeNull());
});

describe("donemBul", () => {
  it("ay adı + yıl", () => expect(donemBul("Dönem: Ocak 2026")).toEqual({ month: 1, year: 2026 }));
  it("MM/YYYY", () => expect(donemBul("fatura dönemi 03/2025")).toEqual({ month: 3, year: 2025 }));
  it("YYYY-MM", () => expect(donemBul("2025-11 dönemi")).toEqual({ year: 2025, month: 11 }));
  it("bulunamazsa boş", () => expect(donemBul("tarihsiz metin")).toEqual({}));
});

describe("belgeNoBul", () => {
  it("fatura no", () => expect(belgeNoBul("Fatura No: ABC-12345")).toBe("ABC-12345"));
  it("irsaliye no", () => expect(belgeNoBul("İrsaliye No: IRS-9-88")).toBe("IRS-9-88"));
  it("fiş no", () => expect(belgeNoBul("Fiş No: F2026001")).toBe("F2026001"));
});

describe("tutarBul", () => {
  it("toplam etiketi", () => expect(tutarBul("GENEL TOPLAM: 12.500,75 TL")).toBeCloseTo(12500.75));
  it("₺ öneki", () => expect(tutarBul("Ödenecek ₺ 950,00")).toBeCloseTo(950));
  it("bulunamazsa undefined", () => expect(tutarBul("tutarsız metin")).toBeUndefined());
});

describe("plakaBul", () => {
  it("boşluklu plaka", () => expect(plakaBul("Plaka: 34 ABC 101")).toBe("34 ABC 101"));
  it("bitişik plaka", () => expect(plakaBul("06AB123 aracı")).toBe("06 AB 123"));
  it("il kodu 81 üstü eşleşmez", () => expect(plakaBul("99 XY 123")).toBeUndefined());
});

describe("plakaNormalize", () => {
  it("boşluk ve tire silinir, büyük harf", () => {
    expect(plakaNormalize("34 abc 101")).toBe(plakaNormalize("34ABC101"));
    expect(plakaNormalize("34-ABC-101")).toBe("34ABC101");
  });
});

describe("profil: fatura", () => {
  it("elektrik faturası kWh → ELEKTRIK", () => {
    const a = profilBul("fatura").cikar("Fatura No: ELK-778 Dönem: Mart 2026 Tüketim: 1.250,5 kWh Toplam: 4.980 TL");
    expect(a.category).toBe("ELEKTRIK");
    expect(a.amount).toBeCloseTo(1250.5);
    expect(a.month).toBe(3);
    expect(a.year).toBe(2026);
    expect(a.documentRef).toBe("ELK-778");
    expect(a.tutarTRY).toBeCloseTo(4980);
  });
  it("doğalgaz Sm³ → DOGALGAZ", () => {
    const a = profilBul("fatura").cikar("Tüketim 840 Sm3");
    expect(a.category).toBe("DOGALGAZ");
    expect(a.amount).toBe(840);
  });
});

describe("profil: yakit_fisi", () => {
  it("motorin + plaka + litre + tutar", () => {
    const a = profilBul("yakit_fisi").cikar("Fiş No: F123456 34 ABC 101 MOTORIN 85,4 lt Toplam: 3.420,00 TL 05/2026");
    expect(a.category).toBe("DIZEL");
    expect(a.amount).toBeCloseTo(85.4);
    expect(a.plateNo).toBe("34 ABC 101");
    expect(a.tutarTRY).toBeCloseTo(3420);
    expect(a.month).toBe(5);
  });
  it("benzin ipucu → BENZIN", () => {
    expect(profilBul("yakit_fisi").cikar("KURŞUNSUZ 95 40 lt").category).toBe("BENZIN");
  });
  it("otogaz → LPG", () => {
    expect(profilBul("yakit_fisi").cikar("OTOGAZ 52 litre").category).toBe("LPG");
  });
});

describe("profil: irsaliye", () => {
  it("ton + geri dönüşüm ipucu", () => {
    const a = profilBul("irsaliye").cikar("İrsaliye No: IRS-445 ambalaj atığı 12,75 ton 04/2026");
    expect(a.category).toBe("GERI_DONUSUM");
    expect(a.amount).toBeCloseTo(12.75);
  });
  it("kg → ton dönüşümü", () => {
    const a = profilBul("irsaliye").cikar("karışık atık 8.500 kg");
    expect(a.category).toBe("ATIK");
    expect(a.amount).toBeCloseTo(8.5);
  });
});

describe("profil: su_faturasi", () => {
  it("m³ → SU", () => {
    const a = profilBul("su_faturasi").cikar("Tüketim: 1.240 m3 Toplam 18.600 TL");
    expect(a.category).toBe("SU");
    expect(a.amount).toBe(1240);
  });
  it("atıksu ipucu → ATIKSU_DEBI", () => {
    expect(profilBul("su_faturasi").cikar("atıksu bedeli 900 m³").category).toBe("ATIKSU_DEBI");
  });
});

describe("kayitDogrula", () => {
  const kayit = { amount: 1000, year: 2026, month: 5 };
  it("tolerans içinde → uyumlu", () => {
    expect(kayitDogrula({ amount: 1015, year: 2026, month: 5 }, kayit).durum).toBe("uyumlu");
  });
  it("miktar sapması → uyumsuz", () => {
    const s = kayitDogrula({ amount: 1300, year: 2026, month: 5 }, kayit);
    expect(s.durum).toBe("uyumsuz");
    expect(s.notlar.join(" ")).toContain("miktar uyumsuz");
  });
  it("dönem farklı → uyumsuz", () => {
    expect(kayitDogrula({ amount: 1000, year: 2026, month: 4 }, kayit).durum).toBe("uyumsuz");
  });
  it("alan yoksa → belirsiz", () => {
    expect(kayitDogrula({}, kayit).durum).toBe("belirsiz");
  });
});
