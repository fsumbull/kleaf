"use client";
/* Rapor indirme istemcisi — tesis/kapsam filtresi, loading state, kent raporu */
import { useState, type ReactNode } from "react";
import { Card, Badge } from "@/components/ui";

interface RaporKart {
  id: string;
  endpoint: string;
  title: string;
  desc: string;
  format: string;
  icon: ReactNode;
  filtrelenebilir: boolean;
}

export function RaporKartlari({ year, tesisler, belediye }: {
  year: number;
  tesisler: { id: string; name: string }[];
  belediye: boolean;
}) {
  const [tesis, setTesis] = useState("");
  const [kapsam, setKapsam] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const selCls =
    "cursor-pointer rounded-xl border border-leaf-200/70 bg-white/80 px-3 py-2 text-[12.5px] text-ink outline-none transition focus:border-leaf-400 focus:ring-2 focus:ring-leaf-100";

  async function indir(kart: RaporKart) {
    setBusy(kart.id);
    try {
      const qs = new URLSearchParams();
      if (kart.filtrelenebilir && tesis) qs.set("tesis", tesis);
      if (kart.filtrelenebilir && kapsam) qs.set("kapsam", kapsam);
      if (kart.id === "kent") qs.set("tur", "kent");
      const res = await fetch(`${kart.endpoint}${qs.size ? `?${qs}` : ""}`);
      if (!res.ok) {
        alert((await res.json().catch(() => null))?.error ?? "Rapor üretilemedi");
        return;
      }
      const blob = await res.blob();
      const cd = res.headers.get("Content-Disposition");
      const name = cd?.match(/filename="([^"]+)"/)?.[1] ?? `kleaf-rapor-${year}`;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = name;
      a.click();
      URL.revokeObjectURL(a.href);
    } finally {
      setBusy(null);
    }
  }

  const cards: RaporKart[] = [
    {
      id: "pdf",
      endpoint: "/api/rapor/pdf",
      title: "Kurumsal envanter raporu",
      desc: "Kapak, KPI özeti, kapsam dağılımı, aylık seyir, kaynak/tesis tabloları ve filo–atık–GES–eylem planı modül özetleri içeren markalı PDF.",
      format: "PDF",
      filtrelenebilir: true,
      icon: (
        <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.6">
          <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
          <path d="M14 3v6h6M9 13h6M9 17h6" strokeLinecap="round" />
        </svg>
      ),
    },
    {
      id: "excel",
      endpoint: "/api/rapor/excel",
      title: "Envanter çalışma kitabı",
      desc: "Özet, envanter, ham veri, filo, atık–GES akışları ve eylem planı sayfalarını içeren çok sayfalı Excel çalışma kitabı.",
      format: "XLSX",
      filtrelenebilir: true,
      icon: (
        <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.6">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <path d="M3 9h18M9 3v18" />
        </svg>
      ),
    },
    ...(belediye ? [{
      id: "kent",
      endpoint: "/api/rapor/pdf",
      title: "Kent envanteri raporu",
      desc: "GPC BASIC sadeleştirmesiyle kent ölçeği topluluk emisyonları: sektör dağılımı, kategori kırılımı, kişi başı emisyon ve mahalle nüfus tabanı.",
      format: "PDF",
      filtrelenebilir: false,
      icon: (
        <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.6">
          <path d="M3 21h18M5 21V7l7-4 7 4v14M9 9h1m4 0h1M9 13h1m4 0h1M9 17h1m4 0h1" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ),
    }] : []),
    {
      id: "mudurluk",
      endpoint: "/api/rapor/mudurluk",
      title: "Müdürlük karnesi",
      desc: "Birim bazında kayıt sayısı, onay ve belge oranları, taslak bekleyenler, emisyon toplamı ve A–D karne notu.",
      format: "XLSX",
      filtrelenebilir: false,
      icon: (
        <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.6">
          <path d="M9 12l2 2 4-4M7 3h10a2 2 0 012 2v14a2 2 0 01-2 2H7a2 2 0 01-2-2V5a2 2 0 012-2z" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ),
    },
  ];

  const filtreAktif = Boolean(tesis || kapsam);

  return (
    <>
      <Card className="rise-2 mb-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="block">
            <span className="mb-1 block text-[11px] font-medium lowercase tracking-wide text-ink/50">tesis filtresi (PDF/Excel)</span>
            <select value={tesis} onChange={(e) => setTesis(e.target.value)} className={selCls}>
              <option value="">tüm tesisler</option>
              {tesisler.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] font-medium lowercase tracking-wide text-ink/50">kapsam filtresi</span>
            <select value={kapsam} onChange={(e) => setKapsam(e.target.value)} className={selCls}>
              <option value="">tüm kapsamlar</option>
              <option value="1">kapsam 1 · doğrudan</option>
              <option value="2">kapsam 2 · elektrik</option>
              <option value="3">kapsam 3 · dolaylı</option>
            </select>
          </label>
          {filtreAktif && (
            <button type="button" onClick={() => { setTesis(""); setKapsam(""); }}
              className="cursor-pointer rounded-xl px-3 py-2 text-[12.5px] font-medium text-ink/50 transition hover:bg-ink/5">
              filtreyi temizle
            </button>
          )}
          {filtreAktif && (
            <span className="text-[11.5px] text-warm">filtreli raporda modül özet sayfaları yer almaz</span>
          )}
        </div>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        {cards.map((c, i) => (
          <Card key={c.id} className={`rise-${Math.min(i + 3, 4)} group relative overflow-hidden`}>
            <div className="pointer-events-none absolute -right-10 -top-10 h-36 w-36 rounded-full bg-leaf-100/50 blur-2xl transition group-hover:bg-leaf-200/60" />
            <div className="flex items-start gap-4">
              <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-leaf-50 text-leaf-700 ring-1 ring-leaf-200/70">
                {c.icon}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="text-[15px] font-bold tracking-tight">{c.title}</h3>
                  <Badge tone="gray">{c.format}</Badge>
                  {c.filtrelenebilir && filtreAktif && <Badge tone="warm">filtreli</Badge>}
                </div>
                <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink/55">{c.desc}</p>
                <button
                  type="button"
                  onClick={() => indir(c)}
                  disabled={busy !== null}
                  className="mt-4 inline-flex cursor-pointer items-center gap-1.5 rounded-xl bg-ink px-4 py-2 text-[12.5px] font-semibold text-white transition hover:bg-leaf-800 disabled:opacity-60"
                >
                  {busy === c.id ? (
                    <>
                      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 animate-spin" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="M12 3a9 9 0 1 0 9 9" strokeLinecap="round" />
                      </svg>
                      hazırlanıyor…
                    </>
                  ) : (
                    <>
                      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M12 3v12m0 0 4-4m-4 4-4-4M4 21h16" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      {year} raporunu indir
                    </>
                  )}
                </button>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </>
  );
}
