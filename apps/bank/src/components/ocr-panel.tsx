"use client";
/* Belgeden doldur — tarayıcıda Tesseract.js OCR (tamamen yerel, görüntü sunucuya gitmez).
 * Fatura/belge görüntüsünden dönem, miktar ve belge no çıkarır; form ön-doldurma önerisi döner. */
import { useRef, useState } from "react";
import { CATEGORIES, MONTHS_TR } from "@/lib/constants";

export interface OcrOneri {
  year?: number;
  month?: number;
  amount?: number;
  documentRef?: string;
  category?: string;
  rawText: string;
}

const AY_ADLARI: Record<string, number> = {};
MONTHS_TR.forEach((m, i) => { AY_ADLARI[m.toLocaleLowerCase("tr")] = i + 1; });

/** OCR metninden alan çıkarımı — TR fatura kalıpları */
export function metindenAlanlar(text: string): OcrOneri {
  const t = text.replace(/\s+/g, " ");
  const oneri: OcrOneri = { rawText: text };

  // dönem: "Ocak 2026", "01/2026", "2026-01", "Dönem: 01.2026"
  const ayYil = t.match(new RegExp(`(${MONTHS_TR.join("|")})\\s*[/ .-]?\\s*(20\\d{2})`, "i"));
  if (ayYil) {
    oneri.month = AY_ADLARI[ayYil[1].toLocaleLowerCase("tr")];
    oneri.year = Number(ayYil[2]);
  } else {
    const sayisal = t.match(/\b(0?[1-9]|1[0-2])[/.\-](20\d{2})\b/) ?? t.match(/\b(20\d{2})[/.\-](0?[1-9]|1[0-2])\b/);
    if (sayisal) {
      const [a, b] = [sayisal[1], sayisal[2]];
      if (a.startsWith("20")) { oneri.year = Number(a); oneri.month = Number(b); }
      else { oneri.month = Number(a); oneri.year = Number(b); }
    }
  }

  // miktar: birimden önce gelen sayı (kWh, m³/m3, lt/litre, ton, kg, Sm3)
  const birimler = [
    { re: /([\d.,]+)\s*k[wW]h/i, cat: "ELEKTRIK" },
    { re: /([\d.,]+)\s*(?:Sm3|Sm³|m3|m³)/i, cat: "DOGALGAZ" },
    { re: /([\d.,]+)\s*(?:lt|litre|L)\b/i, cat: "DIZEL" },
    { re: /([\d.,]+)\s*ton\b/i, cat: "ATIK" },
  ];
  for (const b of birimler) {
    const m = t.match(b.re);
    if (m) {
      const num = parseTrNumber(m[1]);
      if (num !== null && num > 0) { oneri.amount = num; oneri.category = b.cat; break; }
    }
  }

  // belge no: "Fatura No: X", "Belge No", "Seri No"
  const belge = t.match(/(?:fatura|belge|seri)\s*no\s*[:.]?\s*([A-Z0-9-]{4,30})/i);
  if (belge) oneri.documentRef = belge[1];

  return oneri;
}

function parseTrNumber(s: string): number | null {
  // "1.234,56" → 1234.56 ; "1234.56" → 1234.56
  const cleaned = s.includes(",")
    ? s.replace(/\./g, "").replace(",", ".")
    : s;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

export function OcrPanel({ onOneri }: { onOneri: (o: OcrOneri) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<"bos" | "calisiyor" | "hata">("bos");
  const [progress, setProgress] = useState(0);
  const [msg, setMsg] = useState<string | null>(null);

  async function onFile(f: File) {
    setState("calisiyor"); setProgress(0); setMsg(null);
    try {
      const { createWorker } = await import("tesseract.js");
      const worker = await createWorker(["tur", "eng"], 1, {
        workerPath: "/tesseract/worker.min.js",
        corePath: "/tesseract/",
        langPath: "/tessdata",
        gzip: true,
        logger: (m: { status?: string; progress?: number }) => {
          if (m.status === "recognizing text" && typeof m.progress === "number") setProgress(m.progress);
        },
      });
      const { data } = await worker.recognize(f);
      await worker.terminate();
      const oneri = metindenAlanlar(data.text ?? "");
      if (!oneri.amount && !oneri.year && !oneri.documentRef) {
        setState("hata");
        setMsg("Belgeden alan çıkarılamadı — daha net bir görüntü deneyin.");
        return;
      }
      setState("bos");
      onOneri(oneri);
    } catch {
      setState("hata");
      setMsg("OCR çalıştırılamadı. Görüntü formatını (PNG/JPG) kontrol edin.");
    }
  }

  return (
    <div className="rounded-xl border border-dashed border-leaf-300/70 bg-leaf-50/50 px-3 py-2.5">
      {state === "calisiyor" ? (
        <div className="flex items-center gap-2 text-[12px] text-ink/60">
          <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-leaf-300 border-t-leaf-600" />
          belge okunuyor… {Math.round(progress * 100)}%
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[11.5px] text-ink/55">
            📄 fatura görüntüsünden otomatik doldur <span className="text-ink/35">(yerel OCR — dosya cihazınızdan çıkmaz)</span>
          </p>
          <button type="button" onClick={() => ref.current?.click()}
            className="cursor-pointer rounded-lg border border-leaf-300/80 bg-white/80 px-2.5 py-1 text-[11.5px] font-medium text-leaf-700 transition hover:bg-leaf-100">
            belge seç
          </button>
        </div>
      )}
      {msg && <p className="mt-1.5 text-[11.5px] text-danger">{msg}</p>}
      <input ref={ref} type="file" accept=".png,.jpg,.jpeg,.webp,.bmp" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ""; }} />
    </div>
  );
}

// kategori etiketini dışarıda kullanmak için yeniden dışa aktarım
export const KATEGORI_ETIKET = new Map(CATEGORIES.map((c) => [c.code, c.label]));
