"use client";
/* Belgeden doldur — tarayıcıda Tesseract.js OCR (tamamen yerel, görüntü sunucuya gitmez).
 * Profil tabanlı: enerji faturası, yakıt fişi, atık irsaliyesi, su faturası kalıpları
 * lib/ocr-profiller.ts içinde tanımlıdır; panel seçilen profile göre alan çıkarır. */
import { useRef, useState } from "react";
import { CATEGORIES } from "@/lib/constants";
import { OCR_PROFILLER, profilBul, type OcrProfilKod, type OcrAlanlar } from "@/lib/ocr-profiller";

export interface OcrOneri extends OcrAlanlar {
  profil: OcrProfilKod;
  rawText: string;
}

/** Geriye dönük uyumluluk: varsayılan (fatura) profiliyle alan çıkarımı */
export function metindenAlanlar(text: string): OcrOneri {
  return { ...profilBul("fatura").cikar(text), profil: "fatura", rawText: text };
}

/** Tarayıcıda yerel OCR çalıştır — görüntü dosyası/blob → ham metin */
export async function ocrTani(f: File | Blob, onProgress?: (p: number) => void): Promise<string> {
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker(["tur", "eng"], 1, {
    workerPath: "/tesseract/worker.min.js",
    corePath: "/tesseract/",
    langPath: "/tessdata",
    gzip: true,
    logger: (m: { status?: string; progress?: number }) => {
      if (m.status === "recognizing text" && typeof m.progress === "number") onProgress?.(m.progress);
    },
  });
  try {
    const { data } = await worker.recognize(f);
    return data.text ?? "";
  } finally {
    await worker.terminate();
  }
}

export function OcrPanel({ onOneri, varsayilanProfil = "fatura", sabitProfil = false }: {
  onOneri: (o: OcrOneri) => void;
  /** başlangıç belge türü (fatura | yakit_fisi | irsaliye | su_faturasi) */
  varsayilanProfil?: OcrProfilKod;
  /** true ise kullanıcı belge türünü değiştiremez */
  sabitProfil?: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<"bos" | "calisiyor" | "hata">("bos");
  const [progress, setProgress] = useState(0);
  const [msg, setMsg] = useState<string | null>(null);
  const [profil, setProfil] = useState<OcrProfilKod>(varsayilanProfil);

  async function onFile(f: File) {
    setState("calisiyor"); setProgress(0); setMsg(null);
    try {
      const text = await ocrTani(f, setProgress);
      const alanlar = profilBul(profil).cikar(text);
      const oneri: OcrOneri = { ...alanlar, profil, rawText: text };
      if (!oneri.amount && !oneri.year && !oneri.documentRef && !oneri.plateNo) {
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

  const seciliProfil = profilBul(profil);

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
            📄 belgeden otomatik doldur <span className="text-ink/35">({seciliProfil.ipucu} — dosya cihazınızdan çıkmaz)</span>
          </p>
          <span className="inline-flex items-center gap-1.5">
            {!sabitProfil && (
              <select
                value={profil} onChange={(e) => setProfil(e.target.value as OcrProfilKod)}
                aria-label="belge türü"
                className="cursor-pointer rounded-lg border border-leaf-300/80 bg-white/80 px-1.5 py-1 text-[11px] text-ink/70 outline-none transition hover:border-leaf-400"
              >
                {OCR_PROFILLER.map((p) => <option key={p.kod} value={p.kod}>{p.etiket}</option>)}
              </select>
            )}
            <button type="button" onClick={() => ref.current?.click()}
              className="cursor-pointer rounded-lg border border-leaf-300/80 bg-white/80 px-2.5 py-1 text-[11.5px] font-medium text-leaf-700 transition hover:bg-leaf-100">
              belge seç
            </button>
          </span>
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
