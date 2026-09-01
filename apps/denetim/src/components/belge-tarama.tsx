"use client";
/* Kanıt belgesi tarama — denetçi, satıcı/alıcı tarafından iletilen dekont veya sözleşme
 * görüntüsünü tarayıcıda yerel OCR ile okur; miktar (tCO₂e), birim fiyat ve toplam tutarı
 * işlem kaydıyla karşılaştırıp uyum rozetleri üretir. Dosya sunucuya gitmez. */
import { useRef, useState } from "react";

interface TaramaSonuc {
  miktarTCO2e?: number;
  tutarTRY?: number;
  birimFiyat?: number;
  rawText: string;
}

function parseTrNumber(s: string): number | null {
  let cleaned: string;
  if (s.includes(",")) cleaned = s.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) cleaned = s.replace(/\./g, ""); // TR binlik grupları
  else cleaned = s;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/** dekont/sözleşme metninden alan çıkarımı */
export function belgedenAlanlar(text: string): TaramaSonuc {
  const t = text.replace(/\s+/g, " ");
  const sonuc: TaramaSonuc = { rawText: text };

  const miktar =
    t.match(/([\d.,]+)\s*tCO2?e?/i) ??
    t.match(/miktar\s*[:.]?\s*([\d.,]+)/i) ??
    t.match(/([\d.,]+)\s*ton\b/i);
  if (miktar) {
    const n = parseTrNumber(miktar[1]);
    if (n !== null && n > 0) sonuc.miktarTCO2e = n;
  }

  const birim = t.match(/([\d.,]+)\s*(?:₺|TL)\s*\/\s*t(?:on|CO2e)?/i) ?? t.match(/birim\s*fiyat\s*[:.]?\s*(?:₺|TL)?\s*([\d.,]+)/i);
  if (birim) {
    const n = parseTrNumber(birim[1]);
    if (n !== null && n > 0) sonuc.birimFiyat = n;
  }

  const tutar =
    t.match(/(?:genel\s*toplam|toplam|tutar|\u00f6denecek)\s*[:.]?\s*(?:₺|TL)?\s*([\d.,]+)\s*(?:₺|TL|TRY)?/i) ??
    t.match(/([\d.,]+)\s*(?:₺|TL|TRY)\b/i);
  if (tutar) {
    const n = parseTrNumber(tutar[1]);
    if (n !== null && n > 0) sonuc.tutarTRY = n;
  }

  return sonuc;
}

function uyum(beklenen: number, bulunan: number | undefined, toleransPct: number): "uyumlu" | "uyumsuz" | "yok" {
  if (bulunan === undefined) return "yok";
  const sapma = beklenen === 0 ? (bulunan === 0 ? 0 : 100) : (Math.abs(bulunan - beklenen) / beklenen) * 100;
  return sapma <= toleransPct ? "uyumlu" : "uyumsuz";
}

function Rozet({ etiket, durum, detay }: { etiket: string; durum: "uyumlu" | "uyumsuz" | "yok"; detay: string }) {
  const stil = durum === "uyumlu" ? "bg-leaf-100 text-leaf-700"
    : durum === "uyumsuz" ? "bg-red-100 text-red-700" : "bg-white/60 text-ink/45";
  return (
    <li className="flex items-center justify-between gap-2 text-[12px]">
      <span className="text-ink/60">{etiket}</span>
      <span className={`cursor-help rounded-full px-2 py-0.5 text-[10.5px] font-medium ${stil}`} title={detay}>
        {durum === "uyumlu" ? "✓ uyumlu" : durum === "uyumsuz" ? "✕ uyumsuz" : "bulunamadı"}
      </span>
    </li>
  );
}

export function BelgeTarama({ beklenenMiktar, beklenenFiyat }: {
  beklenenMiktar: number;
  beklenenFiyat: number;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<"bos" | "calisiyor" | "hata">("bos");
  const [progress, setProgress] = useState(0);
  const [sonuc, setSonuc] = useState<TaramaSonuc | null>(null);

  async function onFile(f: File) {
    setState("calisiyor"); setProgress(0); setSonuc(null);
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
      setSonuc(belgedenAlanlar(data.text ?? ""));
      setState("bos");
    } catch {
      setState("hata");
    }
  }

  const beklenenToplam = beklenenMiktar * beklenenFiyat;

  return (
    <div className="mt-2 space-y-2">
      {state === "calisiyor" ? (
        <div className="flex items-center gap-2 text-[12px] text-ink/60">
          <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-leaf-300 border-t-leaf-600" />
          belge okunuyor… {Math.round(progress * 100)}%
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[11.5px] text-ink/55">
            dekont / sözleşme görüntüsü <span className="text-ink/35">(yerel OCR — dosya cihazdan çıkmaz)</span>
          </p>
          <button type="button" onClick={() => ref.current?.click()}
            className="cursor-pointer rounded-lg border border-leaf-300/80 bg-white/80 px-2.5 py-1 text-[11.5px] font-medium text-leaf-700 transition hover:bg-leaf-100">
            belge seç
          </button>
        </div>
      )}
      {state === "hata" && <p className="text-[11.5px] text-danger">OCR çalıştırılamadı — PNG/JPG görüntü deneyin.</p>}

      {sonuc && (
        <>
          <ul className="space-y-1 rounded-xl border border-leaf-200/50 bg-white/50 px-3 py-2">
            <Rozet etiket={`miktar (${beklenenMiktar.toLocaleString("tr-TR")} tCO₂e)`}
              durum={uyum(beklenenMiktar, sonuc.miktarTCO2e, 1)}
              detay={sonuc.miktarTCO2e !== undefined ? `belgede: ${sonuc.miktarTCO2e.toLocaleString("tr-TR")}` : "belgede miktar bulunamadı"} />
            <Rozet etiket={`birim fiyat (${beklenenFiyat.toLocaleString("tr-TR")} ₺/t)`}
              durum={uyum(beklenenFiyat, sonuc.birimFiyat, 2)}
              detay={sonuc.birimFiyat !== undefined ? `belgede: ${sonuc.birimFiyat.toLocaleString("tr-TR")}` : "belgede birim fiyat bulunamadı"} />
            <Rozet etiket={`toplam (${beklenenToplam.toLocaleString("tr-TR")} ₺)`}
              durum={uyum(beklenenToplam, sonuc.tutarTRY, 2)}
              detay={sonuc.tutarTRY !== undefined ? `belgede: ${sonuc.tutarTRY.toLocaleString("tr-TR")}` : "belgede toplam tutar bulunamadı"} />
          </ul>
          <details className="text-[11px] text-ink/45">
            <summary className="cursor-pointer select-none hover:text-ink/70">ham OCR metni</summary>
            <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap rounded-lg bg-white/60 p-2 text-[10.5px] leading-relaxed">{sonuc.rawText.trim() || "(boş)"}</pre>
          </details>
        </>
      )}

      <input ref={ref} type="file" accept=".png,.jpg,.jpeg,.webp,.bmp" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ""; }} />
    </div>
  );
}
