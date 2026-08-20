import { describe, it, expect } from "vitest";
import { kalemEslestir } from "./envanter";
import { ENVANTER_KALEMLERI } from "../../prisma/envanter-kalemleri";

describe("kalemEslestir — otomatik kategori eşleme", () => {
  it("kWh → ELEKTRIK", () => {
    expect(kalemEslestir("Ofis elektrik tüketimi", "kWh")).toEqual({ mode: "HESAPLANABILIR", categoryCode: "ELEKTRIK" });
    // karma birimde ilk belirteç kazanır
    expect(kalemEslestir("Sera veya fidanlık elektrik/doğalgaz tüketimi", "kWh / m³").categoryCode).toBe("ELEKTRIK");
  });

  it("m³ + doğalgaz → DOGALGAZ; doğalgaz olmayan m³ → IZLEME", () => {
    expect(kalemEslestir("Ofis doğalgaz tüketimi", "m³")).toEqual({ mode: "HESAPLANABILIR", categoryCode: "DOGALGAZ" });
    expect(kalemEslestir("Sera doğalgaz/ısıtma tüketimi", "m³ / kWh").categoryCode).toBe("DOGALGAZ");
    expect(kalemEslestir("Sulama suyu tüketimi", "m³").mode).toBe("IZLEME");
    expect(kalemEslestir("Kazı ve hafriyat miktarı", "m³ / ton").mode).toBe("IZLEME");
  });

  it("L yakıtlar → DIZEL varsayılan, benzin adı geçince BENZIN, jeneratör → JENERATOR_DIZEL", () => {
    expect(kalemEslestir("Araç yakıt tüketimi", "L").categoryCode).toBe("DIZEL");
    expect(kalemEslestir("Afet eğitim araçları yakıt tüketimi", "L dizel / benzin").categoryCode).toBe("DIZEL");
    expect(kalemEslestir("Motosiklet benzin tüketimi", "L benzin").categoryCode).toBe("BENZIN");
    expect(kalemEslestir("Jeneratör yakıt tüketimi", "L").categoryCode).toBe("JENERATOR_DIZEL");
    expect(kalemEslestir("Saha kontrol araçları yakıt tüketimi", "L / km").categoryCode).toBe("DIZEL");
  });

  it("kg gaz → SOGUTUCU_GAZ; düz kg → IZLEME", () => {
    expect(kalemEslestir("Soğutucu gaz kaçakları", "kg gaz").categoryCode).toBe("SOGUTUCU_GAZ");
    expect(kalemEslestir("Gübre kullanımı", "kg").mode).toBe("IZLEME");
  });

  it("TL / adet / ton harcama kalemleri → IZLEME", () => {
    expect(kalemEslestir("Danışmanlık hizmetleri", "TL").mode).toBe("IZLEME");
    expect(kalemEslestir("Bilgisayar alımları", "adet").mode).toBe("IZLEME");
    expect(kalemEslestir("Asfalt kullanımı", "ton").mode).toBe("IZLEME");
    expect(kalemEslestir("Dijital arşiv sistemleri hizmetleri", "TL / kWh").mode).toBe("IZLEME");
  });

  it("342 kalemin tamamı hatasız eşlenir ve en az 90 kalem hesaplanabilir çıkar", () => {
    let hesaplanabilir = 0;
    for (const k of ENVANTER_KALEMLERI) {
      const e = kalemEslestir(k.ad, k.veriBirimi);
      if (e.mode === "HESAPLANABILIR") {
        expect(e.categoryCode).toBeTruthy();
        hesaplanabilir++;
      } else {
        expect(e.categoryCode).toBeNull();
      }
    }
    expect(ENVANTER_KALEMLERI.length).toBe(342);
    expect(hesaplanabilir).toBeGreaterThanOrEqual(90);
  });
});
