/* Karbon kredisi durum makinesi + cüzdan matematiği — DB'den bağımsız saf çekirdek.
 *
 * Çift taraf kuralı: TALEP'i belediye açar, BANKA_ONAY'ı banka verir, TRANSFER'i belediye
 * tamamlar — hiçbir statü geçişi tek kurumun yetkisiyle iki adım ilerleyemez.
 */
import type { CreditStatus } from "./constants";

export type KrediTaraf = "BELEDIYE" | "BANKA" | "KLEAF";

/** Geçiş matrisi: mevcut durum → { hedef, kimin yetkisiyle } listesi
 * DENETIM_ASKI: Kleaf denetçisi askıya alır — çözüldüğünde bir önceki durumuna döner (askiOncesiStatus alanı). */
export const KREDI_GECISLERI: Record<CreditStatus, { hedef: CreditStatus; taraf: KrediTaraf }[]> = {
  TALEP: [
    { hedef: "BANKA_ONAY", taraf: "BANKA" },
    { hedef: "RED", taraf: "BANKA" },
    { hedef: "IPTAL", taraf: "BELEDIYE" },
    { hedef: "DENETIM_ASKI", taraf: "KLEAF" },
  ],
  BANKA_ONAY: [
    { hedef: "TRANSFER", taraf: "BELEDIYE" },
    { hedef: "RED", taraf: "BANKA" },
    { hedef: "IPTAL", taraf: "BELEDIYE" },
    { hedef: "DENETIM_ASKI", taraf: "KLEAF" },
  ],
  TRANSFER: [
    { hedef: "DENETIM_ASKI", taraf: "KLEAF" },
  ],
  RED: [], // nihai
  IPTAL: [], // nihai
  DENETIM_ASKI: [
    // çözüldüğünde önceki duruma dönüş — API katmanı askiOncesiStatus'u geri yükler
    { hedef: "TALEP", taraf: "KLEAF" },
    { hedef: "BANKA_ONAY", taraf: "KLEAF" },
    { hedef: "TRANSFER", taraf: "KLEAF" },
  ],
};

/** Geçiş izinli mi? (durum + taraf birlikte denetlenir) */
export function gecisIzinliMi(mevcut: CreditStatus, hedef: CreditStatus, taraf: KrediTaraf): boolean {
  return KREDI_GECISLERI[mevcut]?.some((g) => g.hedef === hedef && g.taraf === taraf) ?? false;
}

/** Statü geçişinde yazılacak denetim eylemi */
export const GECIS_AUDIT: Record<string, string> = {
  BANKA_ONAY: "KREDI_ONAY",
  TRANSFER: "KREDI_TRANSFER",
  RED: "KREDI_RED",
  IPTAL: "KREDI_IPTAL",
  DENETIM_ASKI: "KREDI_DENETIM_ASKI",
};

/* ── cüzdan matematiği ── */

export interface CuzdanIslem { status: string; amountTCO2e: number }
export interface CuzdanMahsup { amountTCO2e: number }

/** Kurum cüzdanı: edinilen (TRANSFER) − mahsup edilen. Negatif olamaz — veri bütünlüğü bozuksa 0 döner. */
export function cuzdanBakiyesi(islemler: CuzdanIslem[], mahsuplar: CuzdanMahsup[]): {
  edinilen: number; mahsup: number; kalan: number;
} {
  const edinilen = islemler.filter((i) => i.status === "TRANSFER").reduce((s, i) => s + i.amountTCO2e, 0);
  const mahsup = mahsuplar.reduce((s, m) => s + m.amountTCO2e, 0);
  return { edinilen, mahsup, kalan: Math.max(0, edinilen - mahsup) };
}

/** Tek işlem üzerinde mahsup edilebilir kalan miktar */
export function islemKalani(amountTCO2e: number, mahsuplar: CuzdanMahsup[]): number {
  return Math.max(0, amountTCO2e - mahsuplar.reduce((s, m) => s + m.amountTCO2e, 0));
}

/** Mahsup isteği geçerli mi? (miktar pozitif ve kalan bakiyeyi aşmıyor) */
export function mahsupGecerliMi(istenen: number, islemTutari: number, oncekiMahsuplar: CuzdanMahsup[]): { ok: boolean; sebep?: string } {
  if (!Number.isFinite(istenen) || istenen <= 0) return { ok: false, sebep: "Mahsup miktarı pozitif olmalıdır" };
  const kalan = islemKalani(islemTutari, oncekiMahsuplar);
  if (istenen > kalan + 1e-9) return { ok: false, sebep: `Yetersiz bakiye — bu işlemde kalan: ${kalan.toLocaleString("tr-TR")} tCO₂e` };
  return { ok: true };
}
