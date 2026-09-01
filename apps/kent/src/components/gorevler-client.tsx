"use client";
/* Görev yönetimi istemcisi — görev listesi, durum filtreleri, yeni görev modalı */
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, Table, EmptyState, Field, inputCls, btnPrimary, btnGhost } from "@/components/ui";
import { CATEGORIES, MONTHS_TR } from "@/lib/constants";

export interface GorevRow {
  id: string;
  unitId: string;
  unit: string;
  year: number;
  month: number;
  category: string;
  dueDate: string; // ISO
  status: string; // BEKLIYOR | TAMAMLANDI
  gecikti: boolean;
  veriVar: boolean;
}

const formSchema = z.object({
  unitId: z.string().min(1, "Birim seçin"),
  year: z.number({ message: "Geçersiz yıl" }).int().min(2000).max(2100),
  month: z.number().int().min(1).max(12),
  category: z.string().min(1, "Kategori seçin"),
  dueDate: z.string().min(1, "Son tarih seçin"),
});
type FormValues = z.infer<typeof formSchema>;

type Filtre = "hepsi" | "bekliyor" | "gecikti" | "tamamlandi";

export function GorevlerClient({ rows, units, canManage, canComplete }: {
  rows: GorevRow[];
  units: { id: string; name: string }[];
  canManage: boolean;
  canComplete: boolean;
}) {
  const router = useRouter();
  const [, start] = useTransition();
  const [filtre, setFiltre] = useState<Filtre>("hepsi");
  const [modal, setModal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const refresh = () => start(() => router.refresh());

  const catLabel = useMemo(() => new Map<string, string>(CATEGORIES.map((c) => [c.code, c.label])), []);

  const filtered = rows.filter((r) => {
    if (filtre === "bekliyor") return r.status === "BEKLIYOR" && !r.gecikti;
    if (filtre === "gecikti") return r.gecikti;
    if (filtre === "tamamlandi") return r.status === "TAMAMLANDI";
    return true;
  });

  async function call(init: RequestInit): Promise<boolean> {
    setError(null);
    const res = await fetch("/api/gorevler", init);
    if (!res.ok) {
      setError((await res.json().catch(() => null))?.error ?? "İşlem başarısız");
      return false;
    }
    return true;
  }

  const setDurum = async (r: GorevRow, status: "TAMAMLANDI" | "BEKLIYOR") => {
    if (await call({ method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: r.id, status }) })) refresh();
  };

  const sil = async (r: GorevRow) => {
    if (!confirm(`${r.unit} · ${catLabel.get(r.category) ?? r.category} (${MONTHS_TR[r.month - 1]} ${r.year}) görevi silinsin mi?`)) return;
    if (await call({ method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: r.id }) })) refresh();
  };

  const filtreler: { key: Filtre; label: string }[] = [
    { key: "hepsi", label: "tümü" },
    { key: "bekliyor", label: "bekliyor" },
    { key: "gecikti", label: "gecikti" },
    { key: "tamamlandi", label: "tamamlandı" },
  ];

  return (
    <div className="rise-2 space-y-3">
      {error && (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-[12.5px] text-danger">{error}</p>
      )}
      <Card pad={false}>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-leaf-100/70 px-5 py-3">
          <span className="inline-flex gap-1.5">
            {filtreler.map((f) => (
              <button key={f.key} onClick={() => setFiltre(f.key)}
                className={`cursor-pointer rounded-full px-3 py-1.5 text-[12px] transition ${
                  filtre === f.key ? "bg-leaf-600 font-medium text-white" : "text-ink/60 hover:bg-leaf-100"
                }`}>
                {f.label}
              </button>
            ))}
          </span>
          {canManage && (
            <button onClick={() => setModal(true)} className={btnPrimary}>+ görev ata</button>
          )}
        </div>
        {filtered.length === 0 ? (
          <EmptyState title="Görev yok" desc="Bu filtreyle eşleşen veri toplama görevi bulunmuyor." />
        ) : (
          <div className="p-2">
            <Table dense head={<>
              <th>birim</th><th>dönem</th><th>kategori</th><th>son tarih</th><th>durum</th><th></th>
            </>}>
              {filtered.map((r) => (
                <tr key={r.id}>
                  <td className="max-w-[220px] truncate font-medium">{r.unit}</td>
                  <td className="whitespace-nowrap text-ink/60">{MONTHS_TR[r.month - 1]} {r.year}</td>
                  <td>{catLabel.get(r.category) ?? r.category}</td>
                  <td className="whitespace-nowrap text-ink/60">
                    {new Date(r.dueDate).toLocaleDateString("tr-TR")}
                  </td>
                  <td className="whitespace-nowrap">
                    {r.status === "TAMAMLANDI" ? (
                      <Pill cls="bg-leaf-100 text-leaf-700">✓ tamamlandı</Pill>
                    ) : r.gecikti ? (
                      <Pill cls="bg-red-100 text-red-700">gecikti</Pill>
                    ) : (
                      <Pill cls="bg-amber-50 text-amber-700">bekliyor</Pill>
                    )}
                    {r.status === "BEKLIYOR" && r.veriVar && (
                      <Pill cls="ml-1 bg-leaf-50 text-leaf-700" title="dönem/kategori için veri girilmiş — görev kapatılabilir">veri girildi</Pill>
                    )}
                  </td>
                  <td className="whitespace-nowrap text-right">
                    {r.status === "BEKLIYOR" && (
                      <>
                        <Link
                          href={`/veri-girisi?yeni=1&kategori=${r.category}&ay=${r.month}`}
                          className="mr-1 cursor-pointer rounded-lg px-2 py-1 text-[11.5px] font-medium text-leaf-700/80 transition hover:bg-leaf-100 hover:text-leaf-800"
                        >
                          veri gir
                        </Link>
                        {canComplete && (
                          <RowBtn onClick={() => setDurum(r, "TAMAMLANDI")} title="görevi tamamla">tamamla</RowBtn>
                        )}
                      </>
                    )}
                    {r.status === "TAMAMLANDI" && canManage && (
                      <RowBtn onClick={() => setDurum(r, "BEKLIYOR")} title="görevi yeniden aç">yeniden aç</RowBtn>
                    )}
                    {canManage && <RowBtn danger onClick={() => sil(r)} title="görevi sil">sil</RowBtn>}
                  </td>
                </tr>
              ))}
            </Table>
          </div>
        )}
      </Card>

      {modal && (
        <YeniGorevModal
          units={units}
          onClose={() => setModal(false)}
          onSaved={() => { setModal(false); refresh(); }}
          setError={setError}
        />
      )}
    </div>
  );
}

function Pill({ children, cls, title }: { children: React.ReactNode; cls: string; title?: string }) {
  return <span title={title} className={`inline-block rounded-full px-2 py-0.5 text-[10.5px] font-medium ${cls}`}>{children}</span>;
}

function RowBtn({ children, onClick, title, danger }: {
  children: React.ReactNode; onClick: () => void; title: string; danger?: boolean;
}) {
  return (
    <button type="button" onClick={onClick} title={title}
      className={`ml-1 cursor-pointer rounded-lg px-2 py-1 text-[11.5px] font-medium transition ${
        danger ? "text-danger/70 hover:bg-red-50 hover:text-danger" : "text-leaf-700/80 hover:bg-leaf-100 hover:text-leaf-800"
      }`}>
      {children}
    </button>
  );
}

function YeniGorevModal({ units, onClose, onSaved, setError }: {
  units: { id: string; name: string }[];
  onClose: () => void;
  onSaved: () => void;
  setError: (m: string | null) => void;
}) {
  const now = new Date();
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      unitId: units[0]?.id ?? "",
      year: now.getFullYear(),
      month: now.getMonth() + 1,
      category: "ELEKTRIK",
      dueDate: new Date(now.getTime() + 14 * 86400_000).toISOString().slice(0, 10),
    },
  });

  async function onSubmit(v: FormValues) {
    const res = await fetch("/api/gorevler", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(v),
    });
    if (!res.ok) {
      setError((await res.json().catch(() => null))?.error ?? "Görev oluşturulamadı");
      onClose();
      return;
    }
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/25 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl border border-leaf-200/60 bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="mb-3 text-[15px] font-bold text-ink">Yeni veri toplama görevi</h3>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3.5">
          <Field label="birim" error={errors.unitId?.message}>
            <select {...register("unitId")} className={inputCls}>
              {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </Field>
          <Field label="kategori" error={errors.category?.message}>
            <select {...register("category")} className={inputCls}>
              {CATEGORIES.map((c) => <option key={c.code} value={c.code}>{c.label} · kapsam {c.scope}</option>)}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="yıl" error={errors.year?.message}>
              <input type="number" {...register("year", { valueAsNumber: true })} className={inputCls} />
            </Field>
            <Field label="ay" error={errors.month?.message}>
              <select {...register("month", { valueAsNumber: true })} className={inputCls}>
                {MONTHS_TR.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
              </select>
            </Field>
          </div>
          <Field label="son tarih" error={errors.dueDate?.message}>
            <input type="date" {...register("dueDate")} className={inputCls} />
          </Field>
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className={btnGhost}>vazgeç</button>
            <button type="submit" disabled={isSubmitting} className={btnPrimary}>
              {isSubmitting ? "kaydediliyor…" : "görevi ata"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
