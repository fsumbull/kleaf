"use client";
/* Entegrasyon istemcisi — API anahtarı oluşturma/pasifleştirme/silme */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { btnPrimary, btnGhost } from "@/components/ui";

export function AnahtarOlustur() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [yeniAnahtar, setYeniAnahtar] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function create() {
    setBusy(true); setErr(null);
    const res = await fetch("/api/anahtarlar", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    setBusy(false);
    const data = await res.json().catch(() => null);
    if (res.ok) { setYeniAnahtar(data.key); setName(""); router.refresh(); }
    else setErr(data?.error ?? "Oluşturulamadı");
  }

  return (
    <div className="grid gap-3">
      <div className="flex gap-2">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="anahtar adı — ör. SCADA sayaç köprüsü"
          className="w-72 rounded-xl border border-leaf-200 bg-white/80 px-3 py-2 text-[13px] outline-none focus:border-leaf-400" />
        <button type="button" className={btnPrimary} onClick={create} disabled={busy || name.trim().length < 2}>
          {busy ? "oluşturuluyor…" : "+ anahtar oluştur"}
        </button>
      </div>
      {err && <p className="text-[12px] text-danger">{err}</p>}
      {yeniAnahtar && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-[12.5px]">
          <p className="mb-1 font-semibold">Anahtar yalnız bir kez gösterilir — güvenli bir yere kaydedin:</p>
          <code className="select-all break-all rounded bg-white/70 px-2 py-1 font-mono text-[12px]">{yeniAnahtar}</code>
          <button type="button" className="ml-2 cursor-pointer text-[11.5px] underline"
            onClick={() => { navigator.clipboard.writeText(yeniAnahtar); }}>kopyala</button>
          <button type="button" className="ml-2 cursor-pointer text-[11.5px] underline" onClick={() => setYeniAnahtar(null)}>kapat</button>
        </div>
      )}
    </div>
  );
}

export function AnahtarAksiyon({ id, active }: { id: string; active: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function toggle() {
    setBusy(true);
    await fetch("/api/anahtarlar", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, active: !active }),
    });
    setBusy(false);
    router.refresh();
  }
  async function del() {
    if (!confirm("Anahtar kalıcı olarak silinecek; entegrasyonlar kopar. Emin misiniz?")) return;
    setBusy(true);
    await fetch("/api/anahtarlar", {
      method: "DELETE", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    setBusy(false);
    router.refresh();
  }

  return (
    <span className="inline-flex gap-1">
      <button type="button" className={btnGhost} onClick={toggle} disabled={busy}>
        {active ? "pasifleştir" : "aktifleştir"}
      </button>
      <button type="button" onClick={del} disabled={busy}
        className="cursor-pointer rounded-lg px-2 py-1 text-[11.5px] text-danger/60 transition hover:bg-red-50 hover:text-danger">
        sil
      </button>
    </span>
  );
}
