"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { ROLE_LABELS, type Role } from "@/lib/constants";

const YEARS = [2024, 2025, 2026];

export function Topbar({ orgName, product, year, userName, role, orgs, activeOrgId, units, activeBirimId, birimKilitli, birimAdi }: {
  orgName: string; product: string; year: number; userName: string; role: Role;
  orgs: { id: string; name: string }[]; activeOrgId: string;
  units: { id: string; name: string }[]; activeBirimId: string; birimKilitli: boolean; birimAdi?: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [pwOpen, setPwOpen] = useState(false);

  const setPref = (body: Record<string, unknown>) =>
    start(async () => {
      await fetch("/api/tercih", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      router.refresh();
    });

  const selCls =
    "cursor-pointer appearance-none rounded-full border border-leaf-200/80 bg-white/70 py-1.5 pl-3.5 pr-8 text-[12.5px] font-medium text-ink outline-none transition hover:border-leaf-400 focus:ring-2 focus:ring-leaf-200";

  return (
    <header className="sticky top-0 z-40 flex items-center justify-between gap-3 border-b border-leaf-200/50 bg-white/55 px-5 py-3 backdrop-blur-xl md:px-8">
      <div className="min-w-0">
        <p className="eyebrow">{product}</p>
        <h2 className="truncate text-[15.5px] font-bold tracking-tight text-ink">{orgName}</h2>
      </div>

      <div className={`flex items-center gap-2.5 ${pending ? "opacity-60" : ""}`}>
        {orgs.length > 1 && (
          <span className="relative">
            <select
              aria-label="kurum seç" value={activeOrgId} className={selCls}
              onChange={(e) => setPref({ orgId: e.target.value })}
            >
              {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
            <Chevron />
          </span>
        )}

        <span className="relative">
          <select
            aria-label="yıl seç" value={year} className={selCls}
            onChange={(e) => setPref({ yil: Number(e.target.value) })}
          >
            {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
          <Chevron />
        </span>

        {birimKilitli ? (
          birimAdi && (
            <span
              title="birim kapsamınız"
              className="hidden items-center gap-1.5 rounded-full border border-leaf-200/80 bg-leaf-50/70 py-1.5 pl-3 pr-3.5 text-[12px] font-medium text-leaf-700 sm:flex"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0110 0v4" />
              </svg>
              birim: {birimAdi}
            </span>
          )
        ) : units.length > 0 ? (
          <span className="relative">
            <select
              aria-label="birim seç" value={activeBirimId} className={selCls}
              onChange={(e) => setPref({ birim: e.target.value })}
            >
              <option value="">tüm birimler</option>
              {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
            <Chevron />
          </span>
        ) : null}

        <span className="hidden items-center gap-2 rounded-full border border-leaf-200/70 bg-white/60 py-1 pl-1 pr-3 sm:flex">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-leaf-600 text-[12px] font-bold text-white">
            {userName.slice(0, 1).toUpperCase()}
          </span>
          <span className="leading-tight">
            <span className="block max-w-[130px] truncate text-[12px] font-medium text-ink">{userName}</span>
            <span className="block text-[10px] lowercase text-ink/45">{ROLE_LABELS[role]}</span>
          </span>
        </span>

        <button
          type="button" title="parolamı değiştir" aria-label="parolamı değiştir" onClick={() => setPwOpen(true)}
          className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border border-leaf-200/70 bg-white/60 text-ink/50 transition hover:border-leaf-300 hover:bg-leaf-50 hover:text-leaf-700"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0110 0v4" />
          </svg>
        </button>

        <form action="/api/auth/logout" method="post">
          <button
            type="submit" title="çıkış yap" aria-label="çıkış yap"
            className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border border-leaf-200/70 bg-white/60 text-ink/50 transition hover:border-red-200 hover:bg-red-50 hover:text-danger"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" />
            </svg>
          </button>
        </form>
      </div>
      {pwOpen && <ParolaDegistirModal onClose={() => setPwOpen(false)} />}
    </header>
  );
}

/* ── kendi parolanı değiştirme modalı (eski + yeni) ── */
function ParolaDegistirModal({ onClose }: { onClose: () => void }) {
  const [eski, setEski] = useState("");
  const [yeni, setYeni] = useState("");
  const [yeni2, setYeni2] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (yeni.length < 10 || !/\p{L}/u.test(yeni) || !/\d/.test(yeni)) {
      setErr("Yeni parola en az 10 karakter olmalı, 1 harf ve 1 rakam içermeli"); return;
    }
    if (yeni !== yeni2) { setErr("Yeni parolalar eşleşmiyor"); return; }
    setBusy(true);
    const res = await fetch("/api/kullanicilar/parola", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eski, yeni }),
    });
    setBusy(false);
    if (res.ok) { setOk(true); setTimeout(onClose, 1000); }
    else setErr((await res.json().catch(() => null))?.error ?? "Değiştirilemedi");
  }

  const inputCls = "w-full rounded-xl border border-leaf-200/70 bg-white/80 px-3.5 py-2.5 text-[13.5px] text-ink outline-none transition placeholder:text-ink/30 focus:border-leaf-400 focus:ring-2 focus:ring-leaf-100";

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/30 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="glass-strong w-full max-w-sm rounded-2xl p-6" onClick={(e) => e.stopPropagation()}>
        <h3 className="mb-4 text-[15px] font-bold tracking-tight">Parolamı değiştir</h3>
        <form onSubmit={onSubmit} className="grid gap-3">
          <label className="block">
            <span className="mb-1 block text-[11.5px] font-medium lowercase tracking-wide text-ink/55">mevcut parola</span>
            <input type="password" value={eski} onChange={(e) => setEski(e.target.value)} className={inputCls} autoFocus autoComplete="current-password" />
          </label>
          <label className="block">
            <span className="mb-1 block text-[11.5px] font-medium lowercase tracking-wide text-ink/55">yeni parola</span>
            <input type="password" value={yeni} onChange={(e) => setYeni(e.target.value)} className={inputCls}
              placeholder="en az 10 karakter, 1 harf + 1 rakam" autoComplete="new-password" />
          </label>
          <label className="block">
            <span className="mb-1 block text-[11.5px] font-medium lowercase tracking-wide text-ink/55">yeni parola (tekrar)</span>
            <input type="password" value={yeni2} onChange={(e) => setYeni2(e.target.value)} className={inputCls} autoComplete="new-password" />
          </label>
          {err && <p className="text-[12px] text-danger">{err}</p>}
          {ok && <p className="text-[12px] font-medium text-leaf-700">Parola değiştirildi ✓</p>}
          <div className="mt-1 flex justify-end gap-2">
            <button type="button" onClick={onClose}
              className="cursor-pointer rounded-xl px-3.5 py-2 text-[12.5px] font-medium text-ink/55 transition hover:bg-ink/5">vazgeç</button>
            <button type="submit" disabled={busy || ok}
              className="cursor-pointer rounded-xl bg-leaf-600 px-3.5 py-2 text-[12.5px] font-semibold text-white transition hover:bg-leaf-700 disabled:opacity-50">
              {busy ? "kaydediliyor…" : "değiştir"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Chevron() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.5"
      strokeLinecap="round" strokeLinejoin="round"
      className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2">
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}
