"use client";
/* Veri girişi istemci arayüzü — filtreler, kayıt modali, onay akışı, toplu onay, Excel içe/dışa aktarım */
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Card, Table, StatusPill, EmptyState, Field, inputCls, btnPrimary, btnGhost,
} from "@/components/ui";
import { CATEGORIES, MONTHS_TR, DATA_STATUS } from "@/lib/constants";
import { fmt2, fmtTons, fmtInt } from "@/lib/format";
import { OcrPanel, type OcrOneri } from "@/components/ocr-panel";

export interface VeriRow {
  id: string;
  facilityId: string;
  facility: string;
  vehicle: string | null;
  year: number;
  month: number;
  category: string;
  amount: number;
  unit: string;
  documentRef: string | null;
  status: string;
  tCO2e: number | null;
  documents: { id: string; fileName: string }[];
}

export interface VehicleOpt { id: string; plateNo: string; name: string | null; facilityId: string | null }

const formSchema = z.object({
  facilityId: z.string().min(1, "Tesis seçin"),
  vehicleId: z.string().optional(),
  year: z.number({ message: "Geçersiz yıl" }).int().min(2000, "Geçersiz yıl").max(2100),
  month: z.number().int().min(1).max(12),
  category: z.string().min(1, "Kategori seçin"),
  amount: z.number({ message: "Geçerli bir sayı girin" }).min(0, "Miktar negatif olamaz"),
  documentRef: z.string().max(200).optional(),
});
type FormValues = z.infer<typeof formSchema>;

export function VeriGirisiClient({ rows, facilities, vehicles, canEdit, canApprove, canUnitApprove, year, years, page, pages, total }: {
  rows: VeriRow[];
  facilities: { id: string; name: string }[];
  vehicles: VehicleOpt[];
  canEdit: boolean;
  canApprove: boolean;
  canUnitApprove: boolean;
  year: number;
  years: number[];
  page: number;
  pages: number;
  total: number;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, start] = useTransition();
  const [modal, setModal] = useState<null | { mode: "yeni"; prefill?: Partial<FormValues> } | { mode: "duzenle"; row: VeriRow }>(null);
  const [importState, setImportState] = useState<null | "seciliyor" | { onizleme: Record<string, unknown> }>(null);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<string | null>(null); // 409'daki mevcut kayıt id'si
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const pendingFile = useRef<File | null>(null);

  const catLabel = useMemo(() => new Map<string, string>(CATEGORIES.map((c) => [c.code, c.label])), []);

  // url parametresiyle modal açma: ?yeni=1&tesis=&kategori=&ay=  /  ?duzenle=<id>
  const yeniParam = params.get("yeni");
  const duzenleParam = params.get("duzenle");
  useEffect(() => {
    if (yeniParam === "1" && canEdit) {
      setModal({
        mode: "yeni",
        prefill: {
          facilityId: params.get("tesis") ?? undefined,
          category: params.get("kategori") ?? undefined,
          month: Number(params.get("ay")) || undefined,
        },
      });
      const next = new URLSearchParams(params.toString());
      next.delete("yeni");
      router.replace(`/veri-girisi?${next.toString()}`, { scroll: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [yeniParam, canEdit]);
  useEffect(() => {
    if (!duzenleParam || !canEdit) return;
    const row = rows.find((r) => r.id === duzenleParam);
    if (row) {
      setModal({ mode: "duzenle", row });
      const next = new URLSearchParams(params.toString());
      next.delete("duzenle");
      router.replace(`/veri-girisi?${next.toString()}`, { scroll: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [duzenleParam, rows, canEdit]);

  const setFilter = (key: string, value: string) => {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value); else next.delete(key);
    next.delete("sayfa"); // filtre değişince başa dön
    setSelected(new Set());
    router.push(`/veri-girisi?${next.toString()}`);
  };

  const goPage = (p: number) => {
    const next = new URLSearchParams(params.toString());
    if (p > 1) next.set("sayfa", String(p)); else next.delete("sayfa");
    setSelected(new Set());
    router.push(`/veri-girisi?${next.toString()}`);
  };

  async function call(path: string, init: RequestInit): Promise<boolean> {
    setError(null);
    const res = await fetch(path, init);
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setError(data?.error ?? "İşlem başarısız");
      return false;
    }
    return true;
  }

  const refresh = () => start(() => router.refresh());

  async function onApprove(row: VeriRow, to: "ONAYLI" | "MUDURLUK_ONAYLI" | "TASLAK") {
    if (await call(`/api/veri/${row.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: to }),
    })) refresh();
  }

  async function onBulkApprove() {
    if (selected.size === 0) return;
    setBulkBusy(true);
    const ok = await call("/api/veri/toplu-onay", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [...selected] }),
    });
    setBulkBusy(false);
    if (ok) { setSelected(new Set()); refresh(); }
  }

  const draftRows = rows.filter((r) => r.status === "TASLAK");
  const allDraftsSelected = draftRows.length > 0 && draftRows.every((r) => selected.has(r.id));
  const toggleAll = () => {
    setSelected(allDraftsSelected ? new Set() : new Set(draftRows.map((r) => r.id)));
  };
  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  async function onDelete(row: VeriRow) {
    if (!confirm(`${row.facility} · ${catLabel.get(row.category) ?? row.category} (${MONTHS_TR[row.month - 1]} ${row.year}) silinsin mi?`)) return;
    if (await call(`/api/veri/${row.id}`, { method: "DELETE" })) refresh();
  }

  async function onImportPick(f: File) {
    pendingFile.current = f;
    const fd = new FormData();
    fd.append("file", f);
    const res = await fetch("/api/veri/aktar", { method: "POST", body: fd });
    const data = await res.json();
    if (!res.ok) { setError(data?.error ?? "Dosya işlenemedi"); setImportState(null); return; }
    setImportState({ onizleme: data });
  }

  async function onImportCommit() {
    const f = pendingFile.current;
    if (!f) return;
    const fd = new FormData();
    fd.append("file", f);
    fd.append("commit", "1");
    const res = await fetch("/api/veri/aktar", { method: "POST", body: fd });
    const data = await res.json();
    if (!res.ok) { setError(data?.error ?? "İçe aktarma başarısız"); }
    setImportState(null);
    pendingFile.current = null;
    refresh();
  }

  return (
    <div className={pending ? "opacity-60 transition" : "transition"}>
      {/* araç çubuğu */}
      <div className="rise mb-4 flex flex-wrap items-center gap-2.5">
        <FilterSelect label="yıl" value={params.get("yil") ?? ""} onChange={(v) => setFilter("yil", v)}
          options={years.map((y) => ({ value: String(y), label: String(y) }))} />
        <FilterSelect label="tesis" value={params.get("tesis") ?? ""} onChange={(v) => setFilter("tesis", v)}
          options={facilities.map((f) => ({ value: f.id, label: f.name }))} />
        <FilterSelect label="kategori" value={params.get("kategori") ?? ""} onChange={(v) => setFilter("kategori", v)}
          options={CATEGORIES.map((c) => ({ value: c.code, label: c.label }))} />
        <FilterSelect label="ay" value={params.get("ay") ?? ""} onChange={(v) => setFilter("ay", v)}
          options={MONTHS_TR.map((m, i) => ({ value: String(i + 1), label: m }))} />
        <FilterSelect label="durum" value={params.get("durum") ?? ""} onChange={(v) => setFilter("durum", v)}
          options={DATA_STATUS.map((s) => ({ value: s, label: s === "TASLAK" ? "taslak" : s === "MUDURLUK_ONAYLI" ? "müdürlük onaylı" : "onaylı" }))} />
        <SearchBox initial={params.get("q") ?? ""} onSearch={(v) => setFilter("q", v)} />

        <span className="flex-1" />

        {canApprove && selected.size > 0 && (
          <button type="button" className={btnPrimary} disabled={bulkBusy} onClick={onBulkApprove}>
            {bulkBusy ? "onaylanıyor…" : `${selected.size} kaydı onayla`}
          </button>
        )}
        <a href="/api/veri/sablon" className={btnGhost} download>şablon indir</a>
        {canEdit && (
          <>
            <button type="button" className={btnGhost} onClick={() => fileRef.current?.click()}>
              excel içe aktar
            </button>
            <input
              ref={fileRef} type="file" accept=".xlsx" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) onImportPick(f); e.target.value = ""; }}
            />
            <button type="button" className={btnPrimary} onClick={() => setModal({ mode: "yeni" })}>
              + yeni kayıt
            </button>
          </>
        )}
      </div>

      {error && (
        <p className="rise mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-[12.5px] text-danger">
          {error}
          {conflict && (
            <button
              className="ml-2 cursor-pointer font-semibold underline"
              onClick={() => {
                const row = rows.find((r) => r.id === conflict);
                setError(null);
                if (row) { setModal({ mode: "duzenle", row }); setConflict(null); }
                else {
                  const next = new URLSearchParams(params.toString());
                  next.delete("sayfa"); next.delete("q"); next.delete("durum");
                  next.set("duzenle", conflict);
                  setConflict(null);
                  router.push(`/veri-girisi?${next.toString()}`);
                }
              }}
            >
              kaydı aç
            </button>
          )}
          <button className="ml-2 cursor-pointer underline" onClick={() => { setError(null); setConflict(null); }}>kapat</button>
        </p>
      )}

      <Card className="rise-1" pad={false}>
        {rows.length === 0 ? (
          <EmptyState title="Filtreyle eşleşen kayıt yok"
            desc={`${year} yılı için farklı bir filtre deneyin ya da yeni kayıt ekleyin.`} />
        ) : (
          <div className="p-2">
            <Table
              dense
              head={<>
                {canApprove && (
                  <th className="w-8">
                    <input
                      type="checkbox" aria-label="tüm taslakları seç"
                      checked={allDraftsSelected}
                      disabled={draftRows.length === 0}
                      onChange={toggleAll}
                      className="size-3.5 cursor-pointer accent-leaf-600"
                    />
                  </th>
                )}
                <th>dönem</th><th>tesis</th><th>kategori</th>
                <th className="text-right">miktar</th><th className="text-right">tCO₂e</th>
                <th>belge</th><th>durum</th><th></th>
              </>}
            >
              {rows.map((r) => (
                <tr key={r.id}>
                  {canApprove && (
                    <td>
                      {r.status === "TASLAK" ? (
                        <input
                          type="checkbox" aria-label="kaydı seç"
                          checked={selected.has(r.id)}
                          onChange={() => toggleOne(r.id)}
                          className="size-3.5 cursor-pointer accent-leaf-600"
                        />
                      ) : null}
                    </td>
                  )}
                  <td className="whitespace-nowrap text-ink/60">{MONTHS_TR[r.month - 1]} {r.year}</td>
                  <td className="max-w-[210px] truncate font-medium">
                    {r.facility}
                    {r.vehicle && <span className="ml-1 font-normal text-ink/45">· {r.vehicle}</span>}
                  </td>
                  <td>{catLabel.get(r.category) ?? r.category}</td>
                  <td className="whitespace-nowrap text-right tabular-nums">
                    {fmt2(r.amount)} <span className="text-ink/40">{r.unit}</span>
                  </td>
                  <td className="whitespace-nowrap text-right tabular-nums">
                    {r.tCO2e === null ? <span className="text-ink/30">—</span> :
                      <span className={r.tCO2e < 0 ? "font-medium text-leaf-600" : ""}>{fmtTons(r.tCO2e)}</span>}
                  </td>
                  <td className="max-w-[150px] truncate text-ink/45">
                    {r.documents.length > 0 ? (
                      <a href={`/api/belgeler?id=${r.documents[0].id}`} className="text-leaf-700 underline decoration-leaf-300 hover:text-leaf-800" title={r.documents[0].fileName}>
                        📎 {r.documents.length > 1 ? `${r.documents.length} belge` : r.documents[0].fileName}
                      </a>
                    ) : (r.documentRef ?? "—")}
                  </td>
                  <td><StatusPill status={r.status} /></td>
                  <td className="whitespace-nowrap text-right">
                    {canApprove && (r.status === "TASLAK" || r.status === "MUDURLUK_ONAYLI") && (
                      <RowBtn onClick={() => onApprove(r, "ONAYLI")} title="onayla ve hesapla">onayla</RowBtn>
                    )}
                    {canUnitApprove && r.status === "TASLAK" && (
                      <RowBtn onClick={() => onApprove(r, "MUDURLUK_ONAYLI")} title="müdürlük ara onayı">müd. onayla</RowBtn>
                    )}
                    {canApprove && r.status === "ONAYLI" && (
                      <RowBtn onClick={() => onApprove(r, "TASLAK")} title="onayı geri al">geri al</RowBtn>
                    )}
                    {canEdit && (
                      <>
                        <BelgeYukleBtn rowId={r.id} onDone={refresh} onError={setError} />
                        <RowBtn onClick={() => setModal({ mode: "duzenle", row: r })} title="düzenle">düzenle</RowBtn>
                        <RowBtn danger onClick={() => onDelete(r)} title="sil">sil</RowBtn>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </Table>
          </div>
        )}
        {pages > 1 && (
          <div className="flex items-center justify-between border-t border-leaf-100/70 px-5 py-3 text-[12px] text-ink/50">
            <span>{fmtInt(total)} kayıt · sayfa {page} / {pages}</span>
            <span className="inline-flex gap-2">
              {page > 1 && (
                <button onClick={() => goPage(page - 1)} className="cursor-pointer rounded-lg px-2.5 py-1 transition hover:bg-leaf-50 hover:text-leaf-800">
                  ← önceki
                </button>
              )}
              {page < pages && (
                <button onClick={() => goPage(page + 1)} className="cursor-pointer rounded-lg px-2.5 py-1 transition hover:bg-leaf-50 hover:text-leaf-800">
                  sonraki →
                </button>
              )}
            </span>
          </div>
        )}
      </Card>

      {modal && (
        <RecordModal
          facilities={facilities} vehicles={vehicles} year={year}
          initial={modal.mode === "duzenle" ? modal.row : undefined}
          prefill={modal.mode === "yeni" ? modal.prefill : undefined}
          lastRow={rows[0]}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); refresh(); }}
          setError={setError}
          setConflict={setConflict}
        />
      )}

      {importState && typeof importState === "object" && (
        <ImportPreviewModal
          data={importState.onizleme}
          onCancel={() => { setImportState(null); pendingFile.current = null; }}
          onCommit={onImportCommit}
        />
      )}
    </div>
  );
}

/* ── alt bileşenler ── */

function FilterSelect({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <select
      aria-label={label} value={value} onChange={(e) => onChange(e.target.value)}
      className="cursor-pointer rounded-full border border-leaf-200/80 bg-white/70 py-1.5 pl-3 pr-7 text-[12px] text-ink/70 outline-none transition hover:border-leaf-400 focus:ring-2 focus:ring-leaf-200"
    >
      <option value="">{label}: tümü</option>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

function SearchBox({ initial, onSearch }: { initial: string; onSearch: (v: string) => void }) {
  const [value, setValue] = useState(initial);
  useEffect(() => setValue(initial), [initial]);
  return (
    <input
      type="search"
      value={value}
      placeholder="belge / tesis ara…"
      aria-label="kayıtlarda ara"
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={(e) => { if (e.key === "Enter") onSearch(value.trim()); }}
      onBlur={() => { if (value.trim() !== initial) onSearch(value.trim()); }}
      className="w-40 rounded-full border border-leaf-200/80 bg-white/70 px-3 py-1.5 text-[12px] text-ink/70 outline-none transition placeholder:text-ink/35 hover:border-leaf-400 focus:ring-2 focus:ring-leaf-200"
    />
  );
}

function RowBtn({ children, onClick, title, danger }: {
  children: React.ReactNode; onClick: () => void; title: string; danger?: boolean;
}) {
  return (
    <button
      type="button" onClick={onClick} title={title}
      className={`ml-1 cursor-pointer rounded-lg px-2 py-1 text-[11.5px] font-medium transition ${
        danger ? "text-danger/70 hover:bg-red-50 hover:text-danger" : "text-leaf-700/80 hover:bg-leaf-100 hover:text-leaf-800"
      }`}
    >
      {children}
    </button>
  );
}

/* kanıt belgesi yükleme (PDF/PNG/JPG/XLSX, ≤5 MB) */
function BelgeYukleBtn({ rowId, onDone, onError }: {
  rowId: string; onDone: () => void; onError: (msg: string) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  async function upload(f: File) {
    setBusy(true);
    const fd = new FormData();
    fd.append("file", f);
    fd.append("activityDataId", rowId);
    const res = await fetch("/api/belgeler", { method: "POST", body: fd });
    setBusy(false);
    if (res.ok) onDone();
    else onError((await res.json().catch(() => null))?.error ?? "Belge yüklenemedi");
  }
  return (
    <>
      <RowBtn onClick={() => ref.current?.click()} title="kanıt belgesi yükle">{busy ? "…" : "belge"}</RowBtn>
      <input ref={ref} type="file" accept=".pdf,.png,.jpg,.jpeg,.xlsx" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ""; }} />
    </>
  );
}

function ModalShell({ title, children, onClose }: {
  title: string; children: React.ReactNode; onClose: () => void;
}) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/25 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="glass-strong w-full max-w-[440px] p-6" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-[16px] font-bold tracking-tight text-ink">{title}</h3>
          <button onClick={onClose} aria-label="kapat"
            className="cursor-pointer rounded-full p-1.5 text-ink/40 transition hover:bg-leaf-100 hover:text-ink">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function RecordModal({ facilities, vehicles, year, initial, prefill, lastRow, onClose, onSaved, setError, setConflict }: {
  facilities: { id: string; name: string }[];
  vehicles: VehicleOpt[];
  year: number;
  initial?: VeriRow;
  prefill?: Partial<FormValues>;
  lastRow?: VeriRow;
  onClose: () => void;
  onSaved: () => void;
  setError: (e: string | null) => void;
  setConflict: (id: string | null) => void;
}) {
  const { register, handleSubmit, watch, setValue, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: initial
      ? { facilityId: initial.facilityId, vehicleId: "", year: initial.year, month: initial.month, category: initial.category, amount: initial.amount, documentRef: initial.documentRef ?? "" }
      : {
          facilityId: prefill?.facilityId ?? facilities[0]?.id ?? "",
          vehicleId: "",
          year: prefill?.year ?? year,
          month: prefill?.month ?? 1,
          category: prefill?.category ?? "ELEKTRIK",
          amount: 0,
          documentRef: "",
        },
  });
  const selectedCat = CATEGORIES.find((c) => c.code === watch("category"));
  const selectedFacility = watch("facilityId");
  const facilityVehicles = vehicles.filter((v) => !v.facilityId || v.facilityId === selectedFacility);
  const [ocrNot, setOcrNot] = useState<string | null>(null);

  function ocrDoldur(o: OcrOneri) {
    const dolan: string[] = [];
    if (o.year) { setValue("year", o.year, { shouldValidate: true }); dolan.push(`yıl ${o.year}`); }
    if (o.month) { setValue("month", o.month, { shouldValidate: true }); dolan.push(MONTHS_TR[o.month - 1]); }
    if (o.amount !== undefined) { setValue("amount", o.amount, { shouldValidate: true }); dolan.push(`miktar ${o.amount}`); }
    if (o.category) { setValue("category", o.category, { shouldValidate: true }); dolan.push(CATEGORIES.find((c) => c.code === o.category)?.label ?? o.category); }
    if (o.documentRef) { setValue("documentRef", o.documentRef); dolan.push(`belge no ${o.documentRef}`); }
    setOcrNot(dolan.length ? `belgeden doldu: ${dolan.join(" · ")} — kontrol edip kaydedin` : null);
  }

  function sonKayittanKopyala() {
    if (!lastRow) return;
    setValue("facilityId", lastRow.facilityId, { shouldValidate: true });
    setValue("category", lastRow.category, { shouldValidate: true });
    setValue("year", lastRow.year, { shouldValidate: true });
    setValue("month", Math.min(lastRow.month + 1, 12), { shouldValidate: true });
    setOcrNot("son kayıttan kopyalandı — miktarı girin");
  }

  async function onSubmit(v: FormValues) {
    const isEdit = !!initial;
    const res = await fetch(isEdit ? `/api/veri/${initial.id}` : "/api/veri", {
      method: isEdit ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(isEdit
        ? { amount: v.amount, documentRef: v.documentRef || null }
        : { ...v, vehicleId: v.vehicleId || null, documentRef: v.documentRef || null }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setError(data?.error ?? "Kaydedilemedi");
      setConflict(res.status === 409 && data?.existingId ? data.existingId : null);
      onClose();
      return;
    }
    onSaved();
  }

  return (
    <ModalShell title={initial ? "Kaydı düzenle" : "Yeni faaliyet kaydı"} onClose={onClose}>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-3.5">
        {!initial && (
          <>
            <OcrPanel onOneri={ocrDoldur} />
            {lastRow && (
              <button type="button" onClick={sonKayittanKopyala}
                className="cursor-pointer text-[11.5px] font-medium text-leaf-700 underline decoration-leaf-300 hover:text-leaf-800">
                ↺ son kayıttan kopyala ({lastRow.facility} · {CATEGORIES.find((c) => c.code === lastRow.category)?.label ?? lastRow.category})
              </button>
            )}
            {ocrNot && (
              <p className="rounded-lg border border-leaf-200 bg-leaf-50 px-3 py-1.5 text-[11.5px] text-leaf-800">{ocrNot}</p>
            )}
          </>
        )}
        <Field label="1 · tesis" error={errors.facilityId?.message}>
          <select {...register("facilityId")} className={inputCls} disabled={!!initial}>
            {facilities.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
        </Field>
        {!initial && facilityVehicles.length > 0 && (
          <Field label="araç (isteğe bağlı — yakıt kaydını araca bağlar)">
            <select {...register("vehicleId")} className={inputCls}>
              <option value="">— tesis geneli —</option>
              {facilityVehicles.map((v) => (
                <option key={v.id} value={v.id}>{v.plateNo}{v.name ? ` · ${v.name}` : ""}</option>
              ))}
            </select>
          </Field>
        )}
        <Field label="2 · kategori" error={errors.category?.message}>
          <select {...register("category")} className={inputCls} disabled={!!initial}>
            {CATEGORIES.map((c) => <option key={c.code} value={c.code}>{c.label} · kapsam {c.scope}</option>)}
          </select>
        </Field>
        {selectedCat && (
          <p className="-mt-2 flex items-center gap-1.5 text-[11px] text-ink/45">
            <span className="rounded-full bg-leaf-100 px-2 py-0.5 font-semibold text-leaf-700">kapsam {selectedCat.scope}</span>
            birim: <b>{selectedCat.unit}</b>
          </p>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label="3 · yıl" error={errors.year?.message}>
            <input type="number" {...register("year", { valueAsNumber: true })} className={inputCls} disabled={!!initial} />
          </Field>
          <Field label="ay" error={errors.month?.message}>
            <select {...register("month", { setValueAs: (v) => Number(v) })} className={inputCls} disabled={!!initial}>
              {MONTHS_TR.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </select>
          </Field>
        </div>
        <Field label="4 · miktar" error={errors.amount?.message}>
          <div className="relative">
            <input type="number" step="any" {...register("amount", { valueAsNumber: true })}
              className={`${inputCls} pr-16 text-[16px] font-semibold tabular-nums`} />
            {selectedCat && (
              <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-[12px] font-medium text-ink/40">
                {selectedCat.unit}
              </span>
            )}
          </div>
        </Field>
        <Field label="belge referansı (isteğe bağlı)">
          <input type="text" placeholder="fatura no, dosya adı…" {...register("documentRef")} className={inputCls} />
        </Field>
        <div className="flex justify-end gap-2 pt-1.5">
          <button type="button" className={btnGhost} onClick={onClose}>vazgeç</button>
          <button type="submit" className={btnPrimary} disabled={isSubmitting}>
            {isSubmitting ? "kaydediliyor…" : "kaydet"}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

function ImportPreviewModal({ data, onCancel, onCommit }: {
  data: Record<string, unknown>;
  onCancel: () => void;
  onCommit: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const hatalar = (data.hatalar ?? []) as { satir: number; mesaj: string }[];
  const ornekler = (data.ornekler ?? []) as { satir: number; tesis: string; donem: string; kategori: string; miktar: number; mevcut: boolean }[];
  return (
    <ModalShell title="İçe aktarma önizlemesi" onClose={onCancel}>
      <div className="space-y-3 text-[13px]">
        <p className="text-ink/70">
          <b>{String(data.toplam)}</b> geçerli satır — <b className="text-leaf-700">{String(data.yeni)}</b> yeni,{" "}
          <b className="text-warm">{String(data.guncellenecek)}</b> güncelleme.
          {hatalar.length > 0 && <> <b className="text-danger">{hatalar.length}</b> satır atlanacak.</>}
        </p>
        {ornekler.length > 0 && (
          <div className="max-h-40 overflow-y-auto rounded-xl border border-leaf-200/60 bg-white/60 p-2.5 text-[12px]">
            {ornekler.map((o) => (
              <p key={o.satir} className="flex justify-between gap-2 py-0.5">
                <span className="truncate text-ink/70">#{o.satir} · {o.tesis} · {o.donem} · {o.kategori}</span>
                <span className="shrink-0 text-ink/45">{o.mevcut ? "güncelle" : "yeni"}</span>
              </p>
            ))}
          </div>
        )}
        {hatalar.length > 0 && (
          <div className="max-h-32 overflow-y-auto rounded-xl border border-red-200/70 bg-red-50/60 p-2.5 text-[12px] text-danger">
            {hatalar.slice(0, 10).map((h) => <p key={h.satir}>satır {h.satir}: {h.mesaj}</p>)}
            {hatalar.length > 10 && <p>… ve {hatalar.length - 10} hata daha</p>}
          </div>
        )}
        <p className="text-[11.5px] text-ink/45">İçe aktarılan kayıtlar taslak olarak eklenir; onay sonrası envantere işlenir.</p>
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className={btnGhost} onClick={onCancel}>vazgeç</button>
          <button type="button" className={btnPrimary} disabled={busy || Number(data.toplam) === 0}
            onClick={() => { setBusy(true); onCommit(); }}>
            {busy ? "aktarılıyor…" : "içe aktar"}
          </button>
        </div>
      </div>
    </ModalShell>
  );
}
