import { describe, it, expect } from "vitest";
import {
  computeKgCO2e, kgToTons, scopeOf, monthlyScopeTotals, yearScopeTotals,
  yoyChangePct, intensity, targetGapPct, linearNetZeroPath, trendProjection,
  scenarioAnnualSavings, scenarioAnnualSavingsTRY, scenarioPath,
  paybackYears, priorityScores, gesFeasibility, gesCoverageRatio, annualize,
  kwhEquivalent, savingsTargetProgress, detectAnomalies, qualityScore, fleetPriorityScore,
  atiksuDengesi, aritmaYogunlugu,
  GES_KWH_PER_KWP_YIL, GES_CAPEX_TRY_PER_KWP, LED_TASARRUF_ORANI,
  type EmissionRow,
} from "./engine";

const row = (p: Partial<EmissionRow> & Pick<EmissionRow, "tCO2e">): EmissionRow => ({
  year: 2025, month: 1, category: "ELEKTRIK", scope: 2, ...p,
});

describe("temel hesap", () => {
  it("bilinen değer: 1.000.000 kWh × 0.442 = 442 tCO2e", () => {
    expect(kgToTons(computeKgCO2e("ELEKTRIK", 1_000_000, 0.442))).toBeCloseTo(442, 6);
  });
  it("bilinen değer: 10.000 m³ doğalgaz × 2.02 = 20.2 tCO2e", () => {
    expect(kgToTons(computeKgCO2e("DOGALGAZ", 10_000, 2.02))).toBeCloseTo(20.2, 6);
  });
  it("bilinen değer: 5.000 L dizel × 2.68 = 13.4 tCO2e", () => {
    expect(kgToTons(computeKgCO2e("DIZEL", 5_000, 2.68))).toBeCloseTo(13.4, 6);
  });
  it("GES üretimi negatif (mahsup) döner", () => {
    expect(computeKgCO2e("GES_URETIM", 1000, 0.442)).toBeCloseTo(-442, 6);
  });
  it("negatif miktar reddedilir", () => {
    expect(() => computeKgCO2e("ELEKTRIK", -5, 0.442)).toThrow();
  });
  it("sıfır miktar sıfır emisyon", () => {
    expect(computeKgCO2e("SU", 0, 0.344)).toBe(0);
  });
});

describe("scope eşleme", () => {
  it.each([
    ["DOGALGAZ", 1], ["DIZEL", 1], ["BENZIN", 1], ["LPG", 1], ["KOMUR", 1], ["ARAC_KM", 1],
    ["ELEKTRIK", 2], ["GES_URETIM", 2],
    ["ATIK", 3], ["SU", 3], ["UCUS_KM", 3],
  ] as const)("%s → Kapsam %d", (cat, scope) => {
    expect(scopeOf(cat)).toBe(scope);
  });
});

describe("GES mahsubu — aylık Kapsam 2 kırpması", () => {
  it("mahsup elektriği düşürür ama 0'ın altına inmez", () => {
    const rows: EmissionRow[] = [
      row({ month: 6, tCO2e: 100 }),
      row({ month: 6, category: "GES_URETIM", tCO2e: -130 }), // fazla üretim
      row({ month: 6, category: "DOGALGAZ", scope: 1, tCO2e: 40 }),
    ];
    const m = monthlyScopeTotals(rows).get("2025-06")!;
    expect(m.s2).toBe(0); // -30'a düşmez
    expect(m.s1).toBe(40);
    expect(m.total).toBe(40);
  });
  it("kısmi mahsup doğru düşer", () => {
    const rows: EmissionRow[] = [
      row({ month: 3, tCO2e: 100 }),
      row({ month: 3, category: "GES_URETIM", tCO2e: -30 }),
    ];
    expect(monthlyScopeTotals(rows).get("2025-03")!.s2).toBeCloseTo(70, 6);
  });
  it("kırpma ay bazında bağımsız uygulanır", () => {
    const rows: EmissionRow[] = [
      row({ month: 1, tCO2e: 10 }),
      row({ month: 1, category: "GES_URETIM", tCO2e: -50 }), // ocak fazlası
      row({ month: 2, tCO2e: 100 }), // şubata taşmaz
    ];
    const y = yearScopeTotals(rows, 2025);
    expect(y.s2).toBe(100); // 0 + 100
  });
});

describe("göstergeler", () => {
  it("YoY değişim", () => {
    const rows: EmissionRow[] = [
      row({ year: 2024, tCO2e: 200, scope: 1, category: "DOGALGAZ" }),
      row({ year: 2025, tCO2e: 150, scope: 1, category: "DOGALGAZ" }),
    ];
    expect(yoyChangePct(rows, 2025)).toBeCloseTo(-25, 6);
  });
  it("önceki yıl yoksa null", () => {
    expect(yoyChangePct([row({ tCO2e: 10 })], 2025)).toBeNull();
  });
  it("yoğunluk ve hedef sapması", () => {
    expect(intensity(442, 400)).toBeCloseTo(1.105, 3);
    expect(intensity(442, 0)).toBeNull();
    expect(targetGapPct(110, 100)).toBeCloseTo(10, 6);
    expect(targetGapPct(90, 100)).toBeCloseTo(-10, 6);
  });
});

describe("patika ve projeksiyon", () => {
  it("net-sıfır patikası uçları: baz yıl → baz değer, hedef yıl → 0", () => {
    const p = linearNetZeroPath(2024, 1000, 2053);
    expect(p.get(2024)).toBeCloseTo(1000, 6);
    expect(p.get(2053)).toBeCloseTo(0, 6);
    expect(p.get(2038)!).toBeGreaterThan(0);
  });
  it("eğilim projeksiyonu azalan seriyi sürdürür ve 0 altına inmez", () => {
    const t = trendProjection(new Map([[2023, 300], [2024, 250], [2025, 200]]), 2032);
    expect(t.get(2026)!).toBeCloseTo(150, 0);
    expect(t.get(2032)!).toBeGreaterThanOrEqual(0);
  });
});

describe("senaryo motoru", () => {
  const ctx = { elektrikFaktoru: 0.442, filoTCO2e: 200, binaEnerjiTCO2e: 600 };
  it("1000 kWp GES ≈ 596.7 tCO2e/yıl azaltım", () => {
    const s = scenarioAnnualSavings({ gesKwp: 1000, filoElektrifikasyonPct: 0, binaVerimlilikPct: 0 }, ctx);
    expect(s.ges).toBeCloseTo(1000 * 1350 * 0.442 / 1000, 3); // 596.7
    expect(s.toplam).toBeCloseTo(s.ges, 6);
  });
  it("filo %50 elektrifikasyon → 200 × 0.5 × 0.7 = 70 tCO2e", () => {
    const s = scenarioAnnualSavings({ gesKwp: 0, filoElektrifikasyonPct: 50, binaVerimlilikPct: 0 }, ctx);
    expect(s.filo).toBeCloseTo(70, 6);
  });
  it("senaryo patikası rampalı düşer, 0 altına inmez", () => {
    const base = new Map([[2026, 100], [2027, 100], [2031, 100], [2040, 100]]);
    const p = scenarioPath(base, 2026, 50, 5);
    expect(p.get(2026)).toBeCloseTo(90, 6);  // 1/5 devrede
    expect(p.get(2031)).toBeCloseTo(50, 6);  // tam devrede
    const p2 = scenarioPath(new Map([[2031, 30]]), 2026, 50, 5);
    expect(p2.get(2031)).toBe(0);
  });
});

describe("yeni kategoriler (v2)", () => {
  it("geri dönüşüm ve kompost mahsup (negatif) döner", () => {
    expect(computeKgCO2e("GERI_DONUSUM", 10, 460)).toBeCloseTo(-4600, 6);
    expect(computeKgCO2e("KOMPOST", 10, 420)).toBeCloseTo(-4200, 6);
  });
  it("GES satış envantere girmez (0 döner)", () => {
    expect(computeKgCO2e("GES_SATIS", 50_000, 0.442)).toBe(0);
  });
  it("CNG ve jeneratör dizel Kapsam 1", () => {
    expect(scopeOf("CNG")).toBe(1);
    expect(scopeOf("JENERATOR_DIZEL")).toBe(1);
    expect(kgToTons(computeKgCO2e("CNG", 1000, 1.9))).toBeCloseTo(1.9, 6);
  });
});

describe("senaryo motoru v2 — genişletilmiş kaldıraçlar", () => {
  const ctx = {
    elektrikFaktoru: 0.442, filoTCO2e: 200, binaEnerjiTCO2e: 600,
    aydinlatmaKwh: 1_000_000, dogalgazTCO2e: 300, atikTon: 1000,
  };
  it("eski parametrelerle geriye uyumlu (yeni kaldıraçlar 0)", () => {
    const s = scenarioAnnualSavings({ gesKwp: 0, filoElektrifikasyonPct: 50, binaVerimlilikPct: 10 }, ctx);
    expect(s.filo).toBeCloseTo(70, 6);
    expect(s.bina).toBeCloseTo(60, 6);
    expect(s.led + s.yalitim + s.kazan + s.kompost + s.ayristirma + s.topluTasima).toBe(0);
    expect(s.toplam).toBeCloseTo(130, 6);
  });
  it("LED dönüşümü: 1 GWh aydınlatma × %100 × 0.55 × 0.442 = 243.1 t", () => {
    const s = scenarioAnnualSavings({ gesKwp: 0, filoElektrifikasyonPct: 0, binaVerimlilikPct: 0, ledDonusumPct: 100 }, ctx);
    expect(s.led).toBeCloseTo(1_000_000 * LED_TASARRUF_ORANI * 0.442 / 1000, 3);
  });
  it("yalıtım %100: 300 × 0.25 = 75 t; kazan %100: 300 × 0.12 = 36 t", () => {
    const s = scenarioAnnualSavings({ gesKwp: 0, filoElektrifikasyonPct: 0, binaVerimlilikPct: 0, yalitimPct: 100, kazanPct: 100 }, ctx);
    expect(s.yalitim).toBeCloseTo(75, 6);
    expect(s.kazan).toBeCloseTo(36, 6);
  });
  it("filo EV + toplu taşıma toplamı filo tabanını aşamaz", () => {
    const s = scenarioAnnualSavings({ gesKwp: 0, filoElektrifikasyonPct: 100, binaVerimlilikPct: 0, topluTasimaPct: 100 }, ctx);
    expect(s.filo + s.topluTasima).toBeLessThanOrEqual(200 + 1e-9);
  });
  it("atık saptırma: kompost %50 → 1000 × 0.45 × 0.5 × 0.42 = 94.5 t; ayrıştırma %50 → 1000 × 0.55 × 0.5 × 0.46 = 126.5 t", () => {
    const s = scenarioAnnualSavings({ gesKwp: 0, filoElektrifikasyonPct: 0, binaVerimlilikPct: 0, kompostSaptirmaPct: 50, ayristirmaArtisiPct: 50 }, ctx);
    expect(s.kompost).toBeCloseTo(94.5, 3);
    expect(s.ayristirma).toBeCloseTo(126.5, 3);
  });
  it("yüzdeler 0-100 aralığına kırpılır", () => {
    const s = scenarioAnnualSavings({ gesKwp: 0, filoElektrifikasyonPct: 150, binaVerimlilikPct: -20 }, ctx);
    expect(s.filo).toBeCloseTo(140, 6); // %100 kabul edilir
    expect(s.bina).toBe(0);
  });
  it("₺ tasarrufu: GES + LED elektrik fiyatıyla çarpılır", () => {
    const t = scenarioAnnualSavingsTRY(
      { gesKwp: 100, filoElektrifikasyonPct: 0, binaVerimlilikPct: 0, ledDonusumPct: 10 },
      { ...ctx, elektrikFiyatiTRY: 4, dogalgazFiyatiTRY: 17, dizelFiyatiTRY: 52, atikBertarafTRY: 850 }
    );
    expect(t.ges).toBeCloseTo(100 * GES_KWH_PER_KWP_YIL * 4, 3);
    expect(t.led).toBeCloseTo(1_000_000 * 0.1 * 0.55 * 4, 3);
    expect(t.toplam).toBeCloseTo(t.ges + t.led + t.gaz + t.filo + t.atik, 6);
  });
});

describe("finansal göstergeler", () => {
  it("geri ödeme: 1.000.000 ₺ / 250.000 ₺/yıl = 4 yıl", () => {
    expect(paybackYears(1_000_000, 250_000)).toBeCloseTo(4, 6);
  });
  it("tasarruf yoksa null, yatırım yoksa 0", () => {
    expect(paybackYears(1_000_000, 0)).toBeNull();
    expect(paybackYears(1_000_000, -5)).toBeNull();
    expect(paybackYears(0, 100)).toBe(0);
  });
  it("öncelik skoru: en iyi oran 100, orantılı normalize", () => {
    const scores = priorityScores([
      { reductionTCO2e: 100, capexTRY: 1_000_000 },  // 0.0001
      { reductionTCO2e: 50, capexTRY: 1_000_000 },   // 0.00005 → 50
      { reductionTCO2e: 10, capexTRY: null },         // bedava → 100
      { reductionTCO2e: 0, capexTRY: 500 },           // 0
    ]);
    expect(scores[0]).toBeCloseTo(100, 6);
    expect(scores[1]).toBeCloseTo(50, 6);
    expect(scores[2]).toBe(100);
    expect(scores[3]).toBe(0);
  });
  it("öncelik skoru: boş liste boş döner, tümü bütçesiz → hepsi 100", () => {
    expect(priorityScores([])).toEqual([]);
    const s = priorityScores([
      { reductionTCO2e: 5, capexTRY: null },
      { reductionTCO2e: 50, capexTRY: 0 },
    ]);
    expect(s[0]).toBe(100);
    expect(s[1]).toBe(100);
  });
});

describe("yıllıklandırma (annualize)", () => {
  it("6 aylık veri ×2 ölçeklenir", () => {
    expect(annualize(100, 6)).toBeCloseTo(200, 6);
  });
  it("12+ ay veri olduğu gibi döner", () => {
    expect(annualize(340, 12)).toBe(340);
    expect(annualize(340, 14)).toBe(340);
  });
  it("veri yoksa (n≤0) 0 döner", () => {
    expect(annualize(500, 0)).toBe(0);
    expect(annualize(500, -3)).toBe(0);
  });
  it("1 aylık veri ×12; kesirli sonuç doğru", () => {
    expect(annualize(10, 1)).toBeCloseTo(120, 6);
    expect(annualize(100, 7)).toBeCloseTo(1200 / 7, 6);
  });
});

describe("GES fizibilite", () => {
  it("850 kWp, %70 öz tüketim — üretim/azaltım/gelir/geri ödeme", () => {
    const r = gesFeasibility({ kwp: 850, ozTuketimPct: 70, elektrikFaktoru: 0.442, elektrikFiyatiTRY: 4.2 });
    expect(r.uretimKwh).toBeCloseTo(850 * 1350, 3);            // 1.147.500
    expect(r.ozTuketimKwh).toBeCloseTo(803_250, 3);
    expect(r.azaltimTCO2e).toBeCloseTo(803_250 * 0.442 / 1000, 2); // ≈ 355
    expect(r.gelirTRY).toBeCloseTo(803_250 * 4.2 + 344_250 * 1.8, 0);
    expect(r.capexTRY).toBeCloseTo(850 * GES_CAPEX_TRY_PER_KWP, 3);
    expect(r.geriOdemeYil!).toBeGreaterThan(0);
  });
  it("verilen CAPEX varsayılanı geçersiz kılar; karşılama oranı", () => {
    const r = gesFeasibility({ kwp: 100, ozTuketimPct: 100, capexTRY: 1_000_000, elektrikFaktoru: 0.442, elektrikFiyatiTRY: 4 });
    expect(r.capexTRY).toBe(1_000_000);
    expect(r.satisKwh).toBe(0);
    expect(gesCoverageRatio(300, 700)).toBeCloseTo(30, 6);
    expect(gesCoverageRatio(0, 0)).toBeNull();
  });
});

describe("kWh eşdeğeri ve tasarruf hedefi", () => {
  it("elektrik + gaz×10.64 + kömür×4.8", () => {
    expect(kwhEquivalent({ elektrikKwh: 1000, dogalgazM3: 100, komurKg: 50 }))
      .toBeCloseTo(1000 + 1064 + 240, 6);
    expect(kwhEquivalent({})).toBe(0);
  });
  it("tasarruf ilerlemesi: baz 1000 → cari 925, hedef %15 → %50 ilerleme", () => {
    expect(savingsTargetProgress(1000, 925, 15)).toBeCloseTo(50, 6);
    expect(savingsTargetProgress(0, 100, 15)).toBeNull();
    expect(savingsTargetProgress(1000, 900, 0)).toBeNull();
  });
  it("tüketim artarsa ilerleme negatif", () => {
    expect(savingsTargetProgress(1000, 1100, 15)!).toBeLessThan(0);
  });
});

describe("anomali tespiti (medyan + MAD)", () => {
  it("belirgin sıçrama yakalanır", () => {
    const a = detectAnomalies([100, 104, 98, 102, 101, 240, 99, 103]);
    expect(a).toHaveLength(1);
    expect(a[0].index).toBe(5);
    expect(a[0].severity).toBe("yuksek");
    expect(a[0].deviationPct).toBeGreaterThan(100);
  });
  it("doğal dalgalanma işaretlenmez (%30 eşik altı)", () => {
    expect(detectAnomalies([100, 110, 95, 105, 92, 108, 99])).toHaveLength(0);
  });
  it("n<4 → boş; tüm değerler 0 → boş", () => {
    expect(detectAnomalies([100, 500, 90])).toHaveLength(0);
    expect(detectAnomalies([0, 0, 0, 0, 0])).toHaveLength(0);
  });
  it("MAD=0 (sabit seri) — yalnız %30 kuralı devrede", () => {
    const a = detectAnomalies([100, 100, 100, 100, 145]);
    expect(a).toHaveLength(1);
    expect(a[0].value).toBe(145);
  });
});

describe("veri kalite skoru", () => {
  it("ağırlıklar: 0.4 tamlık + 0.3 onay + 0.2 belge + 0.1 (1−aykırı)", () => {
    const q = qualityScore({ beklenenHucre: 100, doluHucre: 80, toplamKayit: 80, onayliKayit: 60, belgeliKayit: 40, aykiriKayit: 8 })!;
    expect(q.tamlik).toBeCloseTo(0.8, 6);
    expect(q.onay).toBeCloseTo(0.75, 6);
    expect(q.belge).toBeCloseTo(0.5, 6);
    expect(q.aykiri).toBeCloseTo(0.1, 6);
    expect(q.skor).toBe(Math.round(100 * (0.4 * 0.8 + 0.3 * 0.75 + 0.2 * 0.5 + 0.1 * 0.9))); // 74
  });
  it("mükemmel veri → 100; kayıt yoksa null", () => {
    expect(qualityScore({ beklenenHucre: 10, doluHucre: 10, toplamKayit: 10, onayliKayit: 10, belgeliKayit: 10, aykiriKayit: 0 })!.skor).toBe(100);
    expect(qualityScore({ beklenenHucre: 10, doluHucre: 0, toplamKayit: 0, onayliKayit: 0, belgeliKayit: 0, aykiriKayit: 0 })).toBeNull();
  });
  it("beklenen hücre 0 → tamlık 1 kabul edilir", () => {
    expect(qualityScore({ beklenenHucre: 0, doluHucre: 0, toplamKayit: 5, onayliKayit: 5, belgeliKayit: 5, aykiriKayit: 0 })!.skor).toBe(100);
  });
});

describe("filo analitiği", () => {
  it("dizel > benzin > LPG > CNG önceliği; elektrik 0", () => {
    expect(fleetPriorityScore("DIZEL", 10)).toBeCloseTo(10, 6);
    expect(fleetPriorityScore("BENZIN", 10)).toBeCloseTo(9, 6);
    expect(fleetPriorityScore("LPG", 10)).toBeCloseTo(8, 6);
    expect(fleetPriorityScore("CNG", 10)).toBeCloseTo(7, 6);
    expect(fleetPriorityScore("ELEKTRIK", 10)).toBe(0);
  });
  it("bilinmeyen yakıt katsayısı 1; negatif emisyon 0'a kırpılır", () => {
    expect(fleetPriorityScore("HIDROJEN", 10)).toBe(10);
    expect(fleetPriorityScore("DIZEL", -5)).toBe(0);
  });
});

describe("atıksu hesapları", () => {
  it("yeni kategorilerin emisyonu doğru hesaplanır", () => {
    expect(computeKgCO2e("ATIKSU_DEBI", 1000, 0.272)).toBeCloseTo(272, 6);
    expect(computeKgCO2e("ARITMA_ENERJI", 100, 0.442)).toBeCloseTo(44.2, 6);
    expect(computeKgCO2e("CAMUR", 2, 250)).toBeCloseTo(500, 6);
    expect(computeKgCO2e("ATIKSU_METAN", 500, 1)).toBeCloseTo(500, 6);
  });
  it("yenilenebilir üretim kredileri negatif döner", () => {
    expect(computeKgCO2e("RUZGAR_URETIM", 100, 0.442)).toBeCloseTo(-44.2, 6);
    expect(computeKgCO2e("BIYOGAZ_URETIM", 100, 0.442)).toBeCloseTo(-44.2, 6);
  });
  it("atıksu kategorileri doğru kapsamda", () => {
    expect(scopeOf("ATIKSU_DEBI")).toBe(3);
    expect(scopeOf("ARITMA_ENERJI")).toBe(2);
    expect(scopeOf("CAMUR")).toBe(3);
    expect(scopeOf("ATIKSU_METAN")).toBe(1);
    expect(scopeOf("RUZGAR_URETIM")).toBe(2);
  });
  it("atiksuDengesi: arıtma + metan − biyogaz kredisi", () => {
    const d = atiksuDengesi([
      { category: "ATIKSU_DEBI", tCO2e: 100 },
      { category: "ARITMA_ENERJI", tCO2e: 40 },
      { category: "CAMUR", tCO2e: 60 },
      { category: "ATIKSU_METAN", tCO2e: 30 },
      { category: "BIYOGAZ_URETIM", tCO2e: -25 },
      { category: "ELEKTRIK", tCO2e: 999 }, // ilgisiz kategori yok sayılır
    ]);
    expect(d.aritmaTCO2e).toBeCloseTo(200, 6);
    expect(d.metanTCO2e).toBeCloseTo(30, 6);
    expect(d.krediTCO2e).toBeCloseTo(25, 6);
    expect(d.netTCO2e).toBeCloseTo(205, 6);
  });
  it("boş giriş → sıfır denge", () => {
    const d = atiksuDengesi([]);
    expect(d.netTCO2e).toBe(0);
  });
  it("aritmaYogunlugu: kgCO2e/m³; debi 0 → null", () => {
    expect(aritmaYogunlugu(205, 1_000_000)).toBeCloseTo(0.205, 6);
    expect(aritmaYogunlugu(205, 0)).toBeNull();
    expect(aritmaYogunlugu(205, -5)).toBeNull();
  });
});
