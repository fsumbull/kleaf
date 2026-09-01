"use client";
/* Bildirim zili — /api/bildirimler'den canlı uyarıları çeker; son görülen imza
 * localStorage'da tutulur, yeni içerik geldiğinde rozet yanar. */
import { useEffect, useRef, useState } from "react";
import Link from "next/link";

interface BildirimItem {
  id: string;
  mesaj: string;
  href: string;
  onem: "bilgi" | "uyari" | "kritik";
}

const SEEN_KEY = "kleafBildirimGorulen";

export function BildirimZili() {
  const [items, setItems] = useState<BildirimItem[]>([]);
  const [open, setOpen] = useState(false);
  const [unseen, setUnseen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let iptal = false;
    fetch("/api/bildirimler")
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((d: { items?: BildirimItem[] }) => {
        if (iptal) return;
        const list = d.items ?? [];
        setItems(list);
        const imza = list.map((i) => i.id).join(",");
        setUnseen(list.length > 0 && localStorage.getItem(SEEN_KEY) !== imza);
      })
      .catch(() => {});
    return () => { iptal = true; };
  }, []);

  useEffect(() => {
    if (!open) return;
    const kapat = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", kapat);
    return () => document.removeEventListener("mousedown", kapat);
  }, [open]);

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next) {
      localStorage.setItem(SEEN_KEY, items.map((i) => i.id).join(","));
      setUnseen(false);
    }
  }

  const onemNokta: Record<BildirimItem["onem"], string> = {
    kritik: "bg-danger",
    uyari: "bg-warm",
    bilgi: "bg-leaf-500",
  };

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button" onClick={toggle} title="bildirimler" aria-label={`bildirimler (${items.length})`}
        className="relative flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border border-leaf-200/70 bg-white/60 text-ink/50 transition hover:border-leaf-300 hover:bg-leaf-50 hover:text-leaf-700"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8a6 6 0 00-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 01-3.4 0" />
        </svg>
        {unseen && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[9px] font-bold text-white">
            {items.length > 9 ? "9+" : items.length}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-10 z-50 w-80 overflow-hidden rounded-2xl border border-leaf-200/70 bg-white shadow-xl">
          <p className="border-b border-leaf-100/80 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-ink/45">
            bildirimler {items.length > 0 && `(${items.length})`}
          </p>
          {items.length === 0 ? (
            <p className="px-4 py-6 text-center text-[12.5px] text-ink/45">Bekleyen bildirim yok 🎉</p>
          ) : (
            <ul className="max-h-80 overflow-y-auto">
              {items.map((i) => (
                <li key={i.id}>
                  <Link
                    href={i.href} onClick={() => setOpen(false)}
                    className="flex items-start gap-2.5 border-b border-leaf-100/50 px-4 py-2.5 transition last:border-0 hover:bg-leaf-50/70"
                  >
                    <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${onemNokta[i.onem]}`} />
                    <span className="text-[12.5px] leading-snug text-ink/75">{i.mesaj}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
