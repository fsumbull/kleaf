"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function ToplaTara() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function tara() {
    setBusy(true); setMsg(null);
    const r = await fetch("/api/tara", { method: "POST" });
    const d = await r.json().catch(() => null);
    if (r.ok) {
      setMsg(`${d?.taranan ?? 0} işlem tarandı, ${d?.yeniBayrak ?? 0} yeni bayrak.`);
      router.refresh();
    } else {
      setMsg(d?.error ?? "Tarama başarısız");
    }
    setBusy(false);
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={tara}
        disabled={busy}
        className="rounded-lg border border-leaf-300 bg-white/70 px-3 py-1.5 text-[12px] font-medium text-leaf-700 hover:bg-leaf-50 disabled:opacity-50"
      >
        {busy ? "taranıyor…" : "toplu uyum taraması"}
      </button>
      {msg && <span className="text-[11px] text-ink/60">{msg}</span>}
    </div>
  );
}
