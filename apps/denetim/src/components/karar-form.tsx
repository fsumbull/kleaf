"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { btnPrimary } from "@/components/ui";

type Karar = "ONAY" | "ASKI" | "ITIRAZ";

export function KararForm({ txId, currentStatus, acikBayrakSay }: { txId: string; currentStatus: string; acikBayrakSay: number }) {
  const router = useRouter();
  const [karar, setKarar] = useState<Karar>("ASKI");
  const [not, setNot] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tur: "ok" | "hata"; txt: string } | null>(null);

  async function submit() {
    setBusy(true); setMsg(null);
    const r = await fetch("/api/karar", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transactionId: txId, karar, not: not || undefined }),
    });
    const d = await r.json().catch(() => null);
    if (r.ok) {
      setMsg({ tur: "ok", txt: "Karar kaydedildi." });
      setNot("");
      router.refresh();
    } else {
      setMsg({ tur: "hata", txt: d?.error ?? "Kayıt başarısız" });
    }
    setBusy(false);
  }

  async function yenidenDegerlendir() {
    setBusy(true); setMsg(null);
    const r = await fetch("/api/yeniden-degerlendir", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transactionId: txId }),
    });
    const d = await r.json().catch(() => null);
    if (r.ok) {
      setMsg({ tur: "ok", txt: `Yeniden değerlendirildi — ${d?.yeniBayrak ?? 0} yeni bayrak.` });
      router.refresh();
    } else {
      setMsg({ tur: "hata", txt: d?.error ?? "Yeniden değerlendirme başarısız" });
    }
    setBusy(false);
  }

  return (
    <div className="mt-2 space-y-2 text-[13px]">
      <p className="text-[11.5px] text-ink/50">
        Mevcut durum: <b>{currentStatus}</b> · açık bayrak: <b>{acikBayrakSay}</b>
      </p>
      <div className="flex gap-1.5">
        {(["ONAY", "ASKI", "ITIRAZ"] as Karar[]).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setKarar(k)}
            className={`flex-1 rounded-lg px-2.5 py-1.5 text-[12px] font-medium transition ${
              karar === k
                ? k === "ONAY" ? "bg-leaf-600 text-white" : k === "ASKI" ? "bg-amber-500 text-white" : "bg-red-600 text-white"
                : "bg-white/60 text-ink/60 hover:bg-white"
            }`}
          >
            {k === "ONAY" ? "Onay" : k === "ASKI" ? "Askı" : "İtiraz"}
          </button>
        ))}
      </div>
      <textarea
        value={not}
        onChange={(e) => setNot(e.target.value)}
        placeholder="Karar notu (opsiyonel)"
        rows={3}
        className="w-full rounded-lg border border-leaf-200/60 bg-white/70 px-2.5 py-1.5 text-[12.5px] outline-none focus:border-leaf-400"
      />
      <div className="flex gap-2">
        <button disabled={busy} onClick={submit} className={btnPrimary}>
          {busy ? "…" : "kararı kaydet"}
        </button>
        <button
          disabled={busy}
          onClick={yenidenDegerlendir}
          className="rounded-lg border border-leaf-300 bg-white/70 px-3 py-1.5 text-[12px] text-leaf-700 hover:bg-leaf-50"
        >
          bayrakları yeniden değerlendir
        </button>
      </div>
      {msg && (
        <p className={`text-[12px] ${msg.tur === "ok" ? "text-leaf-700" : "text-red-700"}`}>{msg.txt}</p>
      )}
    </div>
  );
}
