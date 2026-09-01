/* OCR profilleri — belge türüne göre alan çıkarım kuralları.
 * Saf fonksiyonlar: tarayıcıda OcrPanel, testte vitest kullanır.
 * Her profil ham OCR metninden dönem, miktar, kategori, plaka, tutar gibi alanları çıkarır. */
import { MONTHS_TR } from "./constants";

export type OcrProfilKod = "fatura" | "yakit_fisi" | "irsaliye" | "su_faturasi";

export interface OcrAlanlar {
  year?: number;
  month?: number;
  amount?: number;
  category?: string;
  documentRef?: string;
  plateNo?: string;
  tutarTRY?: number;
}

const AY_ADLARI: Record<string, number> = {};
MONTHS_TR.forEach((m, i) => { AY_ADLARI[m.toLocaleLowerCase("tr")] = i + 1; });

/** "1.234,56" → 1234.56 · "4.980" → 4980 (TR binlik) · "1234.56" → 1234.56 */
export function parseTrNumber(s: string): number | null {
  let cleaned: string;
  if (s.includes(",")) cleaned = s.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) cleaned = s.replace(/\./g, ""); // yalnız binlik grupları
  else cleaned = s;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/** dönem: "Ocak 2026", "01/2026", "2026-01", "Dönem: 01.2026" */
export function donemBul(t: string): { year?: number; month?: number } {
  const ayYil = t.match(new RegExp(`(${MONTHS_TR.join("|")})\\s*[/ .-]?\\s*(20\\d{2})`, "i"));
  if (ayYil) return { month: AY_ADLARI[ayYil[1].toLocaleLowerCase("tr")], year: Number(ayYil[2]) };
  const sayisal = t.match(/\b(0?[1-9]|1[0-2])[/.\-](20\d{2})\b/) ?? t.match(/\b(20\d{2})[/.\-](0?[1-9]|1[0-2])\b/);
  if (sayisal) {
    const [a, b] = [sayisal[1], sayisal[2]];
    return a.startsWith("20")
      ? { year: Number(a), month: Number(b) }
      : { month: Number(a), year: Number(b) };
  }
  return {};
}

/** belge no: "Fatura No: X", "Belge No", "Seri No", "İrsaliye No", "Fiş No" */
export function belgeNoBul(t: string): string | undefined {
  const m = t.match(/(?:fatura|belge|seri|[iİı]rsaliye|fi[şs])\s*no\s*[:.]?\s*([A-Z0-9-]{4,30})/i);
  return m?.[1];
}

/** tutar: "Toplam: 1.234,56 TL", "₺ 950,00", "GENEL TOPLAM 12.500 TL" */
export function tutarBul(t: string): number | undefined {
  const m =
    t.match(/(?:genel\s*toplam|toplam|tutar|\u00f6denecek)\s*[:.]?\s*(?:₺|TL)?\s*([\d.,]+)\s*(?:₺|TL|TRY)?/i) ??
    t.match(/(?:₺|TL)\s*([\d.,]+)/i) ??
    t.match(/([\d.,]+)\s*(?:₺|TL|TRY)\b/i);
  if (!m) return undefined;
  const n = parseTrNumber(m[1]);
  return n !== null && n > 0 ? n : undefined;
}

/** TR plaka: "34 ABC 101", "06AB123" — il kodu (01-81) + 1-3 harf + 2-5 rakam */
export function plakaBul(t: string): string | undefined {
  const m = t.match(/\b(0?[1-9]|[1-7][0-9]|8[01])\s?([A-Z]{1,3})\s?(\d{2,5})\b/);
  if (!m) return undefined;
  return `${m[1].padStart(2, "0")} ${m[2]} ${m[3]}`;
}

/** plaka karşılaştırma anahtarı: boşluk/tire sil, büyük harfe çevir */
export function plakaNormalize(s: string): string {
  return s.replace(/[\s-]/g, "").toLocaleUpperCase("tr").replace("İ", "I");
}

type MiktarKalip = { re: RegExp; cat: string };

function miktarBul(t: string, kaliplar: MiktarKalip[]): { amount: number; category: string } | undefined {
  for (const k of kaliplar) {
    const m = t.match(k.re);
    if (m) {
      const n = parseTrNumber(m[1]);
      if (n !== null && n > 0) return { amount: n, category: k.cat };
    }
  }
  return undefined;
}

/** yakıt türü metin ipuçlarından kategori seçimi */
function yakitKategori(t: string): string {
  if (/\b(motorin|dizel|diesel)\b/i.test(t)) return "DIZEL";
  if (/\b(kur[şs]unsuz|benzin)\b/i.test(t)) return "BENZIN";
  if (/\b(lpg|otogaz)\b/i.test(t)) return "LPG";
  if (/\bcng\b/i.test(t)) return "CNG";
  return "DIZEL"; // filo varsayılanı
}

/** atık türü metin ipuçlarından kategori seçimi */
function atikKategori(t: string): string {
  if (/\b(geri\s*d[öo]n[üu][şs][üu]m|ambalaj|ka[ğg][ıi]t|plastik)\b/i.test(t)) return "GERI_DONUSUM";
  if (/\bkompost\b/i.test(t)) return "KOMPOST";
  if (/\b(ar[ıi]tma\s*[çc]amuru|[çc]amur)\b/i.test(t)) return "CAMUR";
  return "ATIK";
}

export interface OcrProfil {
  kod: OcrProfilKod;
  etiket: string;
  ipucu: string;
  cikar: (text: string) => OcrAlanlar;
}

export const OCR_PROFILLER: readonly OcrProfil[] = [
  {
    kod: "fatura",
    etiket: "Enerji faturası",
    ipucu: "elektrik / doğalgaz faturası — kWh, Sm³",
    cikar(text) {
      const t = text.replace(/\s+/g, " ");
      const alanlar: OcrAlanlar = { ...donemBul(t), documentRef: belgeNoBul(t), tutarTRY: tutarBul(t) };
      const miktar = miktarBul(t, [
        { re: /([\d.,]+)\s*k[wW]h/i, cat: "ELEKTRIK" },
        { re: /([\d.,]+)\s*(?:Sm3|Sm³|m3|m³)/i, cat: "DOGALGAZ" },
        { re: /([\d.,]+)\s*(?:lt|litre|L)\b/i, cat: "DIZEL" },
        { re: /([\d.,]+)\s*ton\b/i, cat: "ATIK" },
      ]);
      if (miktar) { alanlar.amount = miktar.amount; alanlar.category = miktar.category; }
      return alanlar;
    },
  },
  {
    kod: "yakit_fisi",
    etiket: "Yakıt fişi",
    ipucu: "akaryakıt fişi — litre, plaka, tutar",
    cikar(text) {
      const t = text.replace(/\s+/g, " ");
      const alanlar: OcrAlanlar = { ...donemBul(t), documentRef: belgeNoBul(t), tutarTRY: tutarBul(t), plateNo: plakaBul(t) };
      const litre = t.match(/([\d.,]+)\s*(?:lt|litre|L)\b/i);
      if (litre) {
        const n = parseTrNumber(litre[1]);
        if (n !== null && n > 0) { alanlar.amount = n; alanlar.category = yakitKategori(t); }
      } else {
        const kg = t.match(/([\d.,]+)\s*kg\b/i); // CNG kg satışı
        if (kg && /\bcng\b/i.test(t)) {
          const n = parseTrNumber(kg[1]);
          if (n !== null && n > 0) { alanlar.amount = n; alanlar.category = "CNG"; }
        }
      }
      return alanlar;
    },
  },
  {
    kod: "irsaliye",
    etiket: "Atık irsaliyesi",
    ipucu: "atık taşıma irsaliyesi — ton, atık türü",
    cikar(text) {
      const t = text.replace(/\s+/g, " ");
      const alanlar: OcrAlanlar = { ...donemBul(t), documentRef: belgeNoBul(t), plateNo: plakaBul(t) };
      const ton = t.match(/([\d.,]+)\s*ton\b/i);
      if (ton) {
        const n = parseTrNumber(ton[1]);
        if (n !== null && n > 0) { alanlar.amount = n; alanlar.category = atikKategori(t); }
      } else {
        const kg = t.match(/([\d.,]+)\s*kg\b/i);
        if (kg) {
          const n = parseTrNumber(kg[1]);
          if (n !== null && n > 0) { alanlar.amount = Math.round((n / 1000) * 1000) / 1000; alanlar.category = atikKategori(t); }
        }
      }
      return alanlar;
    },
  },
  {
    kod: "su_faturasi",
    etiket: "Su faturası",
    ipucu: "şebeke suyu / atıksu faturası — m³",
    cikar(text) {
      const t = text.replace(/\s+/g, " ");
      const alanlar: OcrAlanlar = { ...donemBul(t), documentRef: belgeNoBul(t), tutarTRY: tutarBul(t) };
      const m3 = t.match(/([\d.,]+)\s*(?:m3|m³)(?!\w)/i);
      if (m3) {
        const n = parseTrNumber(m3[1]);
        if (n !== null && n > 0) {
          alanlar.amount = n;
          alanlar.category = /\bat[ıi]ksu\b/i.test(t) ? "ATIKSU_DEBI" : "SU";
        }
      }
      return alanlar;
    },
  },
];

export function profilBul(kod: OcrProfilKod): OcrProfil {
  return OCR_PROFILLER.find((p) => p.kod === kod) ?? OCR_PROFILLER[0];
}

/** kayıt–belge çapraz doğrulama: OCR alanları ile girilmiş kayıt uyuşuyor mu? */
export interface DogrulamaSonuc {
  durum: "uyumlu" | "uyumsuz" | "belirsiz";
  notlar: string[];
}

export function kayitDogrula(
  alanlar: OcrAlanlar,
  kayit: { amount: number; year: number; month: number },
  toleransPct = 2,
): DogrulamaSonuc {
  const notlar: string[] = [];
  let uyumsuz = false;
  let karsilastirilan = 0;

  if (alanlar.amount !== undefined) {
    karsilastirilan++;
    const sapma = kayit.amount === 0
      ? (alanlar.amount === 0 ? 0 : 100)
      : Math.abs(alanlar.amount - kayit.amount) / kayit.amount * 100;
    if (sapma <= toleransPct) {
      notlar.push(`miktar uyumlu (belgede ${alanlar.amount})`);
    } else {
      uyumsuz = true;
      notlar.push(`miktar uyumsuz: belgede ${alanlar.amount}, kayıtta ${kayit.amount} (%${sapma.toFixed(1)} sapma)`);
    }
  }
  if (alanlar.year !== undefined && alanlar.month !== undefined) {
    karsilastirilan++;
    if (alanlar.year === kayit.year && alanlar.month === kayit.month) {
      notlar.push("dönem uyumlu");
    } else {
      uyumsuz = true;
      notlar.push(`dönem uyumsuz: belgede ${String(alanlar.month).padStart(2, "0")}/${alanlar.year}, kayıtta ${String(kayit.month).padStart(2, "0")}/${kayit.year}`);
    }
  }

  if (karsilastirilan === 0) return { durum: "belirsiz", notlar: ["belgeden karşılaştırılabilir alan çıkarılamadı"] };
  return { durum: uyumsuz ? "uyumsuz" : "uyumlu", notlar };
}
