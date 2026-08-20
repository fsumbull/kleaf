/**
 * Kurum risk skoru — deterministik heuristik.
 * puan = bayrakSay × 3 + gecikmeAy × 2 + redSay × 5
 * kademe: A (<10) · B (10-20) · C (20-35) · D (35-55) · E (55+)
 */

export type RiskGirdi = { bayrakSay: number; gecikmeAy: number; redSay: number };
export type RiskKademe = "A" | "B" | "C" | "D" | "E";
export type RiskCiktisi = { puan: number; kademe: RiskKademe; detay: string };

export function hesaplaRiskPuan({ bayrakSay, gecikmeAy, redSay }: RiskGirdi): RiskCiktisi {
  const puan = bayrakSay * 3 + gecikmeAy * 2 + redSay * 5;
  const kademe: RiskKademe = puan < 10 ? "A" : puan < 20 ? "B" : puan < 35 ? "C" : puan < 55 ? "D" : "E";
  const detay = `${bayrakSay}×3 bayrak + ${gecikmeAy}×2 gecikme (ay) + ${redSay}×5 red = ${puan}`;
  return { puan, kademe, detay };
}

export const KADEME_ETIKET: Record<RiskKademe, { renk: "leaf" | "warm" | "danger" | "gray"; aciklama: string }> = {
  A: { renk: "leaf",   aciklama: "temiz — uyum kaydı yüksek" },
  B: { renk: "leaf",   aciklama: "düşük risk — küçük bulgular" },
  C: { renk: "warm",   aciklama: "orta risk — izlenmeli" },
  D: { renk: "warm",   aciklama: "yüksek risk — plan gerekli" },
  E: { renk: "danger", aciklama: "kritik — ivedi denetim" },
};
