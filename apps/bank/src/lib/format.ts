/* tr-TR sayı/tarih biçimleme yardımcıları */

const nf0 = new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 1 });
const nf2 = new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 2 });

export const fmtInt = (v: number) => nf0.format(v);
export const fmt1 = (v: number) => nf1.format(v);
export const fmt2 = (v: number) => nf2.format(v);

/** tCO2e akıllı biçim: büyük değerler tam sayı, küçükler 1 ondalık */
export const fmtTons = (v: number) => (Math.abs(v) >= 100 ? nf0.format(v) : nf1.format(v));

export const fmtPct = (v: number, signed = true) =>
  `${signed && v > 0 ? "+" : ""}${nf1.format(v)}%`;

export const fmtTRY = (v: number) =>
  new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 0 }).format(v);

export const fmtDate = (d: Date | string) =>
  new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium" }).format(new Date(d));

export const fmtDateTime = (d: Date | string) =>
  new Intl.DateTimeFormat("tr-TR", { dateStyle: "short", timeStyle: "short" }).format(new Date(d));
