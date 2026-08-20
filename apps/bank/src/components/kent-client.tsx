"use client";

/**
 * Kent ölçeği envanter istemci bileşeni — sektör dağılım grafikleri
 * + mahalle ve sektör verisi yönetim modalları (BELEDIYE yöneticileri).
 */
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardTitle, Table, Field, inputCls, btnPrimary, btnGhost, EmptyState } from "@/components/ui";
import Chart from "@/components/chart";
import { fmtTons, fmtInt } from "@/lib/format";
import { CITY_SECTORS, CITY_SECTOR_LABELS, CATEGORIES, type CitySector } from "@/lib/constants";

const SECTOR_COLORS: Record<string, string> = {
  KONUT: "#16a34a", TICARET: "#84cc16", KAMU_BINA: "#0ea5e9",
  ULASIM: "#f59e0b", ATIK: "#78716c", ATIKSU: "#6366f1", ENERJI: "#eab308",
};

export interface SectorSlice { sector: string; label: string; tCO2e: number }
export interface SectorYearRow { label: string; sector: string; values: { year: number; tCO2e: number }[] }

export function KentCharts({ slices, yearRows, years }: {
  slices: SectorSlice[];
  yearRows: SectorYearRow[];
  years: number[];
}) {
  const donut = {
    tooltip: {
      trigger: "item" as const,
      valueFormatter: (v: unknown) => `${fmtTons(Number(v))} tCO₂e`,
    },
    legend: { bottom: 0, icon: "circle", itemWidth: 9, itemHeight: 9, textStyle: { fontSize: 11.5 } },
    series: [{
      type: "pie" as const,
      radius: ["52%", "76%"],
      center: ["50%", "44%"],
      itemStyle: { borderColor: "#fff", borderWidth: 2, borderRadius: 5 },
      label: { show: false },
      data: slices.map((s) => ({
        name: s.label,
        value: Math.round(s.tCO2e),
        itemStyle: { color: SECTOR_COLORS[s.sector] ?? "#94a3b8" },
      })),
    }],
  };

  const bar = {
    tooltip: {
      trigger: "axis" as const,
      valueFormatter: (v: unknown) => `${fmtTons(Number(v))} tCO₂e`,
    },
    grid: { left: 8, right: 16, top: 30, bottom: 8, containLabel: true },
    legend: { top: 0, icon: "circle", itemWidth: 9, itemHeight: 9, textStyle: { fontSize: 11.5 } },
    xAxis: {
      type: "category" as const,
      data: yearRows.map((r) => r.label),
      axisLabel: { fontSize: 11, interval: 0, rotate: yearRows.length > 5 ? 18 : 0 },
      axisTick: { show: false },
    },
    yAxis: { type: "value" as const, splitLine: { lineStyle: { color: "rgba(22,163,74,0.08)" } }, axisLabel: { fontSize: 11 } },
    series: years.map((y, i) => ({
      name: String(y),
      type: "bar" as const,
      barWidth: years.length > 1 ? 14 : 22,
      itemStyle: { borderRadius: [4, 4, 0, 0], color: i === years.length - 1 ? "#16a34a" : "rgba(22,163,74,0.35)" },
      data: yearRows.map((r) => Math.round(r.values.find((v) => v.year === y)?.tCO2e ?? 0)),
    })),
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_1.4fr]">
      <Card>
        <CardTitle right={<span className="text-[11px] text-ink/40">kent envanteri sektör payları</span>}>sektör dağılımı</CardTitle>
        <Chart option={donut} height={300} />
      </Card>
      <Card>
        <CardTitle right={<span className="text-[11px] text-ink/40">tCO₂e — koyu renk son yıl</span>}>sektör bazında yıl karşılaştırması</CardTitle>
        <Chart option={bar} height={300} />
      </Card>
    </div>
  );
}

/* ---------- yönetim (mahalle + sektör verisi CRUD) ---------- */

export interface MahalleRow { id: string; name: string; population: number }
export interface KentVeriRow { id: string; year: number; sector: string; category: string; amount: number; neighborhoodId: string | null }

function ModalShell({ onClose, children, wide }: { onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/25 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className={`glass-strong max-h-[85vh] w-full overflow-y-auto p-6 ${wide ? "max-w-[560px]" : "max-w-[420px]"}`} onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

/** Sektör verisi ekleme/düzenleme modalı. */
function VeriModal({ orgId, neighborhoods, initial, defaultYear, onClose }: {
  orgId: string;
  neighborhoods: MahalleRow[];
  initial?: KentVeriRow;
  defaultYear: number;
  onClose: () => void;
}) {
  const router = useRouter();
  const [year, setYear] = useState(String(initial?.year ?? defaultYear));
  const [sector, setSector] = useState(initial?.sector ?? "KONUT");
  const [category, setCategory] = useState(initial?.category ?? "ELEKTRIK");
  const [amount, setAmount] = useState(initial ? String(initial.amount) : "");
  const [neighborhoodId, setNeighborhoodId] = useState(initial?.neighborhoodId ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const unit = CATEGORIES.find((c) => c.code === category)?.unit ?? "birim";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const y = Number(year), a = Number(amount.replace(",", "."));
    if (!Number.isInteger(y) || y < 2000 || y > 2100) return setError("Geçersiz yıl");
    if (!Number.isFinite(a) || a < 0) return setError("Geçerli bir miktar girin");
    setBusy(true);
    try {
      const res = await fetch("/api/kent", {
        method: initial ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tip: "veri", orgId, ...(initial ? { id: initial.id } : {}),
          year: y, sector, category, amount: a, neighborhoodId: neighborhoodId || null,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? "Kaydedilemedi");
        return;
      }
      onClose();
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <ModalShell onClose={onClose}>
      <h3 className="mb-1 text-[16px] font-bold tracking-tight text-ink">{initial ? "Sektör verisini düzenle" : "Sektör verisi ekle"}</h3>
      <p className="mb-4 text-[12px] text-ink/50">Kent envanteri aktivite verisi — emisyon, kütüphane faktörüyle hesaplanır.</p>
      <form onSubmit={submit} className="space-y-3.5">
        <div className="grid grid-cols-2 gap-3">
          <Field label="yıl">
            <input type="number" value={year} onChange={(e) => setYear(e.target.value)} className={inputCls} />
          </Field>
          <Field label="sektör">
            <select value={sector} onChange={(e) => setSector(e.target.value)} className={inputCls}>
              {CITY_SECTORS.map((s) => <option key={s} value={s}>{CITY_SECTOR_LABELS[s]}</option>)}
            </select>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="kategori">
            <select value={category} onChange={(e) => setCategory(e.target.value)} className={inputCls}>
              {CATEGORIES.map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}
            </select>
          </Field>
          <Field label={`miktar (${unit})`}>
            <input type="text" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className={inputCls} placeholder="örn. 125000" />
          </Field>
        </div>
        <Field label="mahalle (isteğe bağlı)">
          <select value={neighborhoodId} onChange={(e) => setNeighborhoodId(e.target.value)} className={inputCls}>
            <option value="">— kent geneli —</option>
            {neighborhoods.map((n) => <option key={n.id} value={n.id}>{n.name}</option>)}
          </select>
        </Field>
        {error && <p className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-[12.5px] text-danger">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className={btnGhost} onClick={onClose}>vazgeç</button>
          <button type="submit" className={btnPrimary} disabled={busy}>{busy ? "kaydediliyor…" : "kaydet"}</button>
        </div>
      </form>
    </ModalShell>
  );
}

/** Mahalle yönetim modalı — ekle, düzenle, sil. */
function MahalleModal({ orgId, neighborhoods, onClose }: { orgId: string; neighborhoods: MahalleRow[]; onClose: () => void }) {
  const router = useRouter();
  const [editing, setEditing] = useState<MahalleRow | null>(null);
  const [name, setName] = useState("");
  const [population, setPopulation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function startEdit(m: MahalleRow) {
    setEditing(m);
    setName(m.name);
    setPopulation(String(m.population));
    setError(null);
  }
  function resetForm() {
    setEditing(null);
    setName("");
    setPopulation("");
    setError(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const p = Number(population);
    if (name.trim().length < 2) return setError("Mahalle adı en az 2 karakter");
    if (!Number.isInteger(p) || p < 0) return setError("Geçerli bir nüfus girin");
    setBusy(true);
    try {
      const res = await fetch("/api/kent", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tip: "mahalle", orgId, ...(editing ? { id: editing.id } : {}), name: name.trim(), population: p }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? "Kaydedilemedi");
        return;
      }
      resetForm();
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function remove(m: MahalleRow) {
    if (!confirm(`"${m.name}" silinsin mi? Bağlı kent verileri kent geneline düşer.`)) return;
    const res = await fetch("/api/kent", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tip: "mahalle", orgId, id: m.id }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setError(data?.error ?? "Silinemedi");
      return;
    }
    if (editing?.id === m.id) resetForm();
    router.refresh();
  }

  return (
    <ModalShell onClose={onClose} wide>
      <h3 className="mb-1 text-[16px] font-bold tracking-tight text-ink">Mahalle yönetimi</h3>
      <p className="mb-4 text-[12px] text-ink/50">Nüfus tabanı kişi başı emisyon ve mahalle pay dağılımında kullanılır.</p>
      <form onSubmit={submit} className="mb-4 grid grid-cols-[1fr_130px_auto] items-end gap-2">
        <Field label={editing ? `düzenle: ${editing.name}` : "yeni mahalle"}>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} className={inputCls} placeholder="mahalle adı" />
        </Field>
        <Field label="nüfus">
          <input type="number" value={population} onChange={(e) => setPopulation(e.target.value)} className={inputCls} placeholder="0" />
        </Field>
        <div className="flex gap-1.5 pb-0.5">
          <button type="submit" className={btnPrimary} disabled={busy}>{editing ? "güncelle" : "+ ekle"}</button>
          {editing && <button type="button" className={btnGhost} onClick={resetForm}>iptal</button>}
        </div>
      </form>
      {error && <p className="mb-3 rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-[12.5px] text-danger">{error}</p>}
      {neighborhoods.length === 0 ? (
        <EmptyState title="Henüz mahalle yok" desc="Yukarıdaki formla ilk mahalleyi ekleyin." />
      ) : (
        <Table dense head={<><th>mahalle</th><th className="text-right">nüfus</th><th className="text-right">işlem</th></>}>
          {neighborhoods.map((m) => (
            <tr key={m.id}>
              <td className="font-medium">{m.name}</td>
              <td className="text-right tabular-nums">{fmtInt(m.population)}</td>
              <td className="whitespace-nowrap text-right">
                <button type="button" onClick={() => startEdit(m)}
                  className="cursor-pointer rounded-lg px-2 py-1 text-[11.5px] font-medium text-ink/60 transition hover:bg-leaf-50 hover:text-leaf-800">
                  düzenle
                </button>
                <button type="button" onClick={() => remove(m)}
                  className="cursor-pointer rounded-lg px-2 py-1 text-[11.5px] font-medium text-danger/70 transition hover:bg-red-50 hover:text-danger">
                  sil
                </button>
              </td>
            </tr>
          ))}
        </Table>
      )}
      <div className="mt-4 flex justify-end">
        <button type="button" className={btnGhost} onClick={onClose}>kapat</button>
      </div>
    </ModalShell>
  );
}

/** Sayfa başlığı aksiyonları: sektör verisi ekle + mahalle yönetimi. */
export function KentAksiyonlar({ orgId, neighborhoods, defaultYear }: {
  orgId: string;
  neighborhoods: MahalleRow[];
  defaultYear: number;
}) {
  const [modal, setModal] = useState<null | "veri" | "mahalle">(null);
  return (
    <div className="flex gap-2">
      <button type="button" className={btnGhost} onClick={() => setModal("mahalle")}>mahalleler</button>
      <button type="button" className={btnPrimary} onClick={() => setModal("veri")}>+ sektör verisi</button>
      {modal === "veri" && <VeriModal orgId={orgId} neighborhoods={neighborhoods} defaultYear={defaultYear} onClose={() => setModal(null)} />}
      {modal === "mahalle" && <MahalleModal orgId={orgId} neighborhoods={neighborhoods} onClose={() => setModal(null)} />}
    </div>
  );
}

/** Yönetim tablosu — seçili envanter yılının tekil kayıtları, düzenle/sil. */
export function KentVeriYonetim({ orgId, rows, neighborhoods, refYear }: {
  orgId: string;
  rows: KentVeriRow[];
  neighborhoods: MahalleRow[];
  refYear: number;
}) {
  const router = useRouter();
  const [editRow, setEditRow] = useState<KentVeriRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const nbName = new Map(neighborhoods.map((n) => [n.id, n.name]));

  async function remove(r: KentVeriRow) {
    if (!confirm("Kent verisi kaydı silinsin mi?")) return;
    setError(null);
    const res = await fetch("/api/kent", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tip: "veri", orgId, id: r.id }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setError(data?.error ?? "Silinemedi");
      return;
    }
    router.refresh();
  }

  return (
    <Card pad={false}>
      <div className="px-5 pt-5">
        <CardTitle right={<span className="text-[11px] text-ink/40">tekil aktivite kayıtları</span>}>{`veri kayıtları · ${refYear}`}</CardTitle>
      </div>
      {error && <p className="mx-5 mb-2 rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-[12.5px] text-danger">{error}</p>}
      {rows.length === 0 ? (
        <EmptyState title="Bu yıl için kayıt yok" desc="Sağ üstten sektör verisi ekleyin." />
      ) : (
        <Table dense head={<><th>sektör</th><th>kategori</th><th className="text-right">miktar</th><th>mahalle</th><th className="text-right">işlem</th></>}>
          {rows.map((r) => (
            <tr key={r.id}>
              <td className="font-medium">{CITY_SECTOR_LABELS[r.sector as CitySector] ?? r.sector}</td>
              <td>{CATEGORIES.find((c) => c.code === r.category)?.label ?? r.category}</td>
              <td className="text-right tabular-nums">
                {fmtInt(r.amount)} {CATEGORIES.find((c) => c.code === r.category)?.unit ?? ""}
              </td>
              <td className="text-ink/55">{r.neighborhoodId ? nbName.get(r.neighborhoodId) ?? "—" : "kent geneli"}</td>
              <td className="whitespace-nowrap text-right">
                <button type="button" onClick={() => setEditRow(r)}
                  className="cursor-pointer rounded-lg px-2 py-1 text-[11.5px] font-medium text-ink/60 transition hover:bg-leaf-50 hover:text-leaf-800">
                  düzenle
                </button>
                <button type="button" onClick={() => remove(r)}
                  className="cursor-pointer rounded-lg px-2 py-1 text-[11.5px] font-medium text-danger/70 transition hover:bg-red-50 hover:text-danger">
                  sil
                </button>
              </td>
            </tr>
          ))}
        </Table>
      )}
      {editRow && (
        <VeriModal orgId={orgId} neighborhoods={neighborhoods} initial={editRow} defaultYear={refYear} onClose={() => setEditRow(null)} />
      )}
    </Card>
  );
}
