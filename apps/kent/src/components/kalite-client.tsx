"use client";

/* Veri kalitesi — tesis filtresi ve anomali doğrulama etkileşimleri */
import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export function TesisFiltre({ facilities, value }: { facilities: { id: string; name: string }[]; value: string }) {
  const router = useRouter();
  const params = useSearchParams();
  return (
    <select
      value={value}
      onChange={(e) => {
        const next = new URLSearchParams(params.toString());
        if (e.target.value) next.set("tesis", e.target.value);
        else next.delete("tesis");
        router.push(`/veri-kalite?${next.toString()}`);
      }}
      className="h-9 rounded-xl border border-leaf-900/10 bg-white px-3 text-[12.5px] font-medium text-ink outline-none transition focus:border-leaf-500"
      aria-label="tesis filtresi"
    >
      <option value="">tüm tesisler</option>
      {facilities.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
    </select>
  );
}

/** Aykırı kaydı "doğrulandı" olarak işaretler/kaldırır — yönetici. PATCH /api/veri/[id] { anomalyOk } */
export function AnomaliOnayToggle({ id, anomalyOk }: { id: string; anomalyOk: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();

  async function toggle() {
    setBusy(true);
    try {
      const res = await fetch(`/api/veri/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ anomalyOk: !anomalyOk }),
      });
      if (res.ok) startTransition(() => router.refresh());
      else {
        const data = await res.json().catch(() => null);
        alert(data?.error ?? "İşlem başarısız");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      onClick={toggle}
      disabled={busy}
      className={`rounded-lg px-2 py-1 text-[11px] font-semibold transition disabled:opacity-50 ${
        anomalyOk
          ? "bg-leaf-100 text-leaf-800 hover:bg-leaf-200"
          : "border border-leaf-900/10 text-ink/60 hover:border-leaf-500 hover:text-leaf-700"
      }`}
      title={anomalyOk ? "Doğrulama işaretini kaldır" : "Gerçek tüketim — veri hatası değil olarak işaretle"}
    >
      {busy ? "…" : anomalyOk ? "✓ doğrulandı" : "doğrula"}
    </button>
  );
}
