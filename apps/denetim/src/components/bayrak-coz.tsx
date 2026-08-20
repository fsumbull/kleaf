"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function BayrakCoz({ id }: { id: string }) {
  const router = useRouter();
  const [acik, setAcik] = useState(false);
  const [not, setNot] = useState("");
  const [busy, setBusy] = useState(false);
  const [hata, setHata] = useState<string | null>(null);

  async function submit() {
    if (not.trim().length < 3) { setHata("Çözüm notu en az 3 karakter"); return; }
    setBusy(true); setHata(null);
    const r = await fetch("/api/bayrak/coz", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, cozumNotu: not }),
    });
    if (r.ok) { setAcik(false); setNot(""); router.refresh(); }
    else { const d = await r.json().catch(() => null); setHata(d?.error ?? "Hata"); }
    setBusy(false);
  }

  if (!acik) {
    return (
      <button
        onClick={() => setAcik(true)}
        className="rounded-lg border border-leaf-300 bg-white/70 px-2.5 py-1 text-[11.5px] text-leaf-700 hover:bg-leaf-50"
      >
        çöz
      </button>
    );
  }
  return (
    <div className="mt-2 flex flex-col gap-2 md:flex-row md:items-start">
      <textarea
        value={not} onChange={(e) => setNot(e.target.value)}
        placeholder="Çözüm notu"
        rows={2}
        className="min-w-[240px] flex-1 rounded-lg border border-leaf-200/60 bg-white/80 px-2.5 py-1.5 text-[12px] outline-none focus:border-leaf-400"
      />
      <div className="flex gap-1.5">
        <button disabled={busy} onClick={submit} className="rounded-lg bg-leaf-600 px-3 py-1.5 text-[12px] font-medium text-white hover:bg-leaf-700">
          {busy ? "…" : "kaydet"}
        </button>
        <button disabled={busy} onClick={() => setAcik(false)} className="rounded-lg bg-white/70 px-2 py-1.5 text-[12px] text-ink/60 hover:bg-white">
          vazgeç
        </button>
      </div>
      {hata && <p className="text-[11px] text-red-700">{hata}</p>}
    </div>
  );
}
