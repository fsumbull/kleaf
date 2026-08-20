"use client";
/* Dönem kilit anahtarı — kapat/aç */
import { useState } from "react";
import { useRouter } from "next/navigation";

export function DonemToggle({ year, month, kapali, canManage }: {
  year: number; month: number; kapali: boolean; canManage: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (!canManage) {
    return <span className="text-[11px] text-ink/30">{kapali ? "kilitli" : "açık"}</span>;
  }

  async function toggle() {
    if (!kapali && !confirm(`${year}-${String(month).padStart(2, "0")} dönemi kapatılacak; veri girişi ve düzenleme engellenecek. Devam edilsin mi?`)) return;
    setBusy(true); setErr(null);
    const res = await fetch("/api/donem", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ year, month, action: kapali ? "AC" : "KAPAT" }),
    });
    setBusy(false);
    if (res.ok) router.refresh();
    else setErr((await res.json().catch(() => null))?.error ?? "İşlem başarısız");
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button type="button" onClick={toggle} disabled={busy}
        className={`inline-flex cursor-pointer items-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition ${
          kapali
            ? "border-ink/10 bg-ink/5 text-ink/45 hover:border-leaf-200 hover:bg-leaf-50 hover:text-leaf-700"
            : "border-leaf-200 bg-leaf-100 text-leaf-700 hover:border-red-200 hover:bg-red-50 hover:text-danger"
        }`}>
        {busy ? "…" : kapali ? "kilidi aç" : "dönemi kapat"}
      </button>
      {err && <span className="text-[11px] text-danger">{err}</span>}
    </span>
  );
}
