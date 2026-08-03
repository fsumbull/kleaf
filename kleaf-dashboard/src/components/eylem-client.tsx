"use client";
/* Eylem planı istemcisi — kart ızgarası, maliyet-etki balon grafiği, ilerleme/durum yönetimi */
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import Chart from "@/components/chart";
import { Card, CardTitle, StatusPill, EmptyState, Field, inputCls, btnPrimary, btnGhost, Badge } from "@/components/ui";
import { ACTION_STATUS, ACTION_STATUS_LABELS } from "@/lib/constants";
import { fmtTons, fmtTRY, fmtDate } from "@/lib/format";

/** ESC tuşuyla modal kapatma — modallar koşullu render edildiğinden form durumu unmount ile sıfırlanır */
function useEsc(onClose: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
}

export interface PlanView {
  id: string;
  title: string;
  description: string | null;
  budgetTRY: number | null;
  targetReductionTCO2e: number;
  status: string;
  owner: string | null;
  startYear: number | null;
  unitId: string | null;
  unitName: string | null;
  startDate: string | null;
  endDate: string | null;
  riskNote: string | null;
  achieved: number;
  spent: number;
  progress: { id: string; date: string; note: string | null; achievedTCO2e: number; spentTRY: number | null }[];
}

export function EylemClient({ plans, orgId, units, canManage, canProgress }: {
  plans: PlanView[]; orgId: string; units: { id: string; name: string }[]; canManage: boolean; canProgress: boolean;
}) {
  const router = useRouter();
  const [planModal, setPlanModal] = useState(false);
  const [progressFor, setProgressFor] = useState<PlanView | null>(null);
  const [editProgress, setEditProgress] = useState<{ plan: PlanView; entry: PlanView["progress"][number] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = () => router.refresh();

  async function onDeleteProgress(plan: PlanView, entry: PlanView["progress"][number]) {
    if (!confirm("İlerleme kaydı silinsin mi? Gerçekleşen toplamdan düşer.")) return;
    const res = await fetch(`/api/eylemler/${plan.id}/ilerleme/${entry.id}`, { method: "DELETE" });
    if (!res.ok) setError((await res.json().catch(() => null))?.error ?? "Silinemedi");
    else refresh();
  }

  async function setStatus(id: string, status: string) {
    const res = await fetch("/api/eylemler", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status }),
    });
    if (!res.ok) setError((await res.json().catch(() => null))?.error ?? "Güncellenemedi");
    else refresh();
  }

  async function onDelete(p: PlanView) {
    if (!confirm(`"${p.title}" eylemi ve ilerleme kayıtları silinsin mi?`)) return;
    await fetch("/api/eylemler", {
      method: "DELETE", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: p.id }),
    });
    refresh();
  }

  return (
    <>
      {error && (
        <p className="rise mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-[12.5px] text-danger">
          {error} <button className="ml-2 cursor-pointer underline" onClick={() => setError(null)}>kapat</button>
        </p>
      )}

      {plans.length > 1 && (
        <Card className="rise-1 mb-5">
          <CardTitle right={<span className="text-[11px] text-ink/40">balon büyüklüğü = gerçekleşen azaltım</span>}>
            maliyet ↔ etki haritası
          </CardTitle>
          <Chart
            height={300}
            option={{
              grid: { left: 70, right: 30, top: 20, bottom: 44 },
              tooltip: {
                formatter: (p: unknown) => {
                  const d = (p as { data: [number, number, number, string] }).data;
                  return `<b>${d[3]}</b><br/>bütçe: ${fmtTRY(d[0])}<br/>hedef azaltım: ${fmtTons(d[1])} tCO₂e<br/>gerçekleşen: ${fmtTons(d[2])} tCO₂e`;
                },
              },
              xAxis: { type: "value", name: "bütçe (₺)", nameLocation: "middle", nameGap: 30,
                axisLabel: { formatter: (v: number) => (v >= 1e6 ? `${v / 1e6} M` : `${v / 1e3} B`) } },
              yAxis: { type: "value", name: "hedef azaltım (tCO₂e/yıl)" },
              series: [{
                type: "scatter",
                symbolSize: (d: number[]) => 14 + Math.min(36, Math.sqrt(Math.max(0, d[2])) * 4),
                itemStyle: { color: "rgba(22,163,74,0.55)", borderColor: "#16a34a", borderWidth: 1.5 },
                emphasis: { itemStyle: { color: "rgba(22,163,74,0.8)" } },
                data: plans.map((p) => [p.budgetTRY ?? 0, p.targetReductionTCO2e, p.achieved, p.title]),
              }],
            }}
          />
        </Card>
      )}

      {plans.length === 0 ? (
        <Card><EmptyState title="Henüz eylem tanımlanmamış"
          desc="Azaltım eylemlerinizi ekleyin; ilerlemeyi tCO₂e ve bütçe bazında takip edin."
          action={canManage ? <button className={btnPrimary} onClick={() => setPlanModal(true)}>+ ilk eylemi ekle</button> : undefined} />
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {plans.map((p, i) => {
            const pct = p.targetReductionTCO2e > 0
              ? Math.min(100, (p.achieved / p.targetReductionTCO2e) * 100) : 0;
            const gecikmis = !!p.endDate && new Date(p.endDate) < new Date() && p.status !== "TAMAMLANDI";
            return (
              <Card key={p.id} className={`rise-${Math.min(4, (i % 4) + 1)}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="text-[15px] font-bold tracking-tight text-ink">{p.title}</h3>
                    <p className="mt-0.5 text-[11.5px] text-ink/45">
                      {[p.unitName ?? p.owner, p.startYear ? `başlangıç ${p.startYear}` : null,
                        p.endDate ? `bitiş ${fmtDate(new Date(p.endDate))}` : null].filter(Boolean).join(" · ") || "—"}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <StatusPill status={p.status} />
                    {gecikmis && <Badge tone="danger">gecikmiş</Badge>}
                  </div>
                </div>

                {p.description && <p className="mt-2.5 line-clamp-2 text-[12.5px] leading-relaxed text-ink/60">{p.description}</p>}
                {p.riskNote && (
                  <p className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11.5px] leading-relaxed text-amber-800">
                    ⚠ {p.riskNote}
                  </p>
                )}

                <div className="mt-4">
                  <div className="flex items-baseline justify-between text-[12px]">
                    <span className="text-ink/55">gerçekleşen / hedef</span>
                    <span className="font-medium text-leaf-700">
                      {fmtTons(p.achieved)} / {fmtTons(p.targetReductionTCO2e)} tCO₂e
                    </span>
                  </div>
                  <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-leaf-100">
                    <div className="h-full rounded-full bg-gradient-to-r from-leaf-600 to-leaf-400 transition-all" style={{ width: `${pct}%` }} />
                  </div>
                  {p.budgetTRY !== null && p.budgetTRY > 0 && (
                    <>
                      <div className="mt-2 flex items-baseline justify-between text-[11px] text-ink/45">
                        <span>bütçe kullanımı</span>
                        <span className={p.spent > p.budgetTRY ? "font-medium text-danger" : ""}>
                          {fmtTRY(p.spent)} / {fmtTRY(p.budgetTRY)} · %{Math.round((p.spent / p.budgetTRY) * 100)}
                        </span>
                      </div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-amber-100">
                        <div
                          className={`h-full rounded-full transition-all ${p.spent > p.budgetTRY ? "bg-gradient-to-r from-red-500 to-red-400" : "bg-gradient-to-r from-amber-500 to-amber-300"}`}
                          style={{ width: `${Math.min(100, (p.spent / p.budgetTRY) * 100)}%` }}
                        />
                      </div>
                    </>
                  )}
                  <div className="mt-1.5 flex justify-between text-[11px] text-ink/45">
                    <span>{p.budgetTRY !== null ? <>bütçe {fmtTRY(p.budgetTRY)}</> : "bütçe tanımsız"}</span>
                    <span>{p.spent > 0 && p.budgetTRY === null && <>harcanan {fmtTRY(p.spent)} · </>}%{pct.toFixed(0)}</span>
                  </div>
                </div>

                {p.progress.length > 0 && (
                  <div className="mt-3 border-t border-leaf-100 pt-3">
                    <p className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-wide text-ink/40">ilerleme çizelgesi</p>
                    <ol className="relative ml-1 space-y-1.5 border-l border-leaf-200 pl-3.5">
                      {p.progress.slice(0, 4).map((pr) => (
                        <li key={pr.id} className="relative">
                          <span className="absolute -left-[19.5px] top-[5px] h-2 w-2 rounded-full border border-white bg-leaf-500" />
                          <div className="flex items-center justify-between gap-2 text-[11.5px]">
                            <span className="truncate text-ink/55">{fmtDate(new Date(pr.date))} — {pr.note ?? "ilerleme"}</span>
                            <span className="flex shrink-0 items-center gap-0.5">
                              <span className="font-medium text-leaf-700">+{fmtTons(pr.achievedTCO2e)} t</span>
                              {canProgress && (
                                <>
                                  <button type="button" title="ilerlemeyi düzenle"
                                    onClick={() => setEditProgress({ plan: p, entry: pr })}
                                    className="cursor-pointer rounded px-1 text-[11px] text-ink/40 transition hover:bg-leaf-100 hover:text-leaf-800">
                                    ✎
                                  </button>
                                  <button type="button" title="ilerlemeyi sil"
                                    onClick={() => onDeleteProgress(p, pr)}
                                    className="cursor-pointer rounded px-1 text-[12px] text-danger/50 transition hover:bg-red-50 hover:text-danger">
                                    ×
                                  </button>
                                </>
                              )}
                            </span>
                          </div>
                        </li>
                      ))}
                      {p.progress.length > 4 && (
                        <li className="text-[11px] text-ink/40">+{p.progress.length - 4} kayıt daha</li>
                      )}
                    </ol>
                  </div>
                )}

                <div className="mt-4 flex flex-wrap items-center gap-1.5">
                  {canProgress && p.status !== "TAMAMLANDI" && (
                    <button className={btnGhost} onClick={() => setProgressFor(p)}>+ ilerleme</button>
                  )}
                  {canManage && (
                    <>
                      <select
                        aria-label="durum değiştir" value={p.status}
                        onChange={(e) => setStatus(p.id, e.target.value)}
                        className="cursor-pointer rounded-full border border-leaf-200 bg-white/70 px-3 py-1.5 text-[11.5px] text-ink/70 outline-none hover:border-leaf-400"
                      >
                        {ACTION_STATUS.map((s) => <option key={s} value={s}>{ACTION_STATUS_LABELS[s]}</option>)}
                      </select>
                      <button
                        className="ml-auto cursor-pointer rounded-lg px-2 py-1 text-[11.5px] text-danger/60 transition hover:bg-red-50 hover:text-danger"
                        onClick={() => onDelete(p)}
                      >sil</button>
                    </>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {canManage && plans.length > 0 && (
        <div className="mt-5 flex justify-center">
          <button className={btnPrimary} onClick={() => setPlanModal(true)}>+ yeni eylem</button>
        </div>
      )}

      {planModal && <PlanModal orgId={orgId} units={units} onClose={() => setPlanModal(false)} onSaved={() => { setPlanModal(false); refresh(); }} />}
      {progressFor && (
        <ProgressModal plan={progressFor} onClose={() => setProgressFor(null)}
          onSaved={() => { setProgressFor(null); refresh(); }} />
      )}
      {editProgress && (
        <ProgressModal plan={editProgress.plan} initial={editProgress.entry} onClose={() => setEditProgress(null)}
          onSaved={() => { setEditProgress(null); refresh(); }} />
      )}
    </>
  );
}

/* ── modallar ── */

const planSchema = z.object({
  title: z.string().min(3, "Başlık en az 3 karakter").max(200),
  description: z.string().max(2000).optional(),
  budgetTRY: z.number({ message: "Sayı girin" }).min(0).optional(),
  targetReductionTCO2e: z.number({ message: "Sayı girin" }).min(0, "Negatif olamaz"),
  owner: z.string().max(120).optional(),
  startYear: z.number({ message: "Yıl girin" }).int().min(2000).max(2100).optional(),
  unitId: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  riskNote: z.string().max(1000).optional(),
});
type PlanValues = z.infer<typeof planSchema>;

function PlanModal({ orgId, units, onClose, onSaved }: { orgId: string; units: { id: string; name: string }[]; onClose: () => void; onSaved: () => void }) {
  useEsc(onClose);
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<PlanValues>({
    resolver: zodResolver(planSchema),
    defaultValues: { title: "", description: "", targetReductionTCO2e: 0, owner: "", startYear: 2026, unitId: "", startDate: "", endDate: "", riskNote: "" },
  });

  async function onSubmit(v: PlanValues) {
    setError(null);
    const res = await fetch("/api/eylemler", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...v, orgId,
        budgetTRY: v.budgetTRY ?? null,
        startYear: v.startYear ?? null,
        unitId: v.unitId || null,
        startDate: v.startDate ? new Date(v.startDate).toISOString() : null,
        endDate: v.endDate ? new Date(v.endDate).toISOString() : null,
        riskNote: v.riskNote || null,
      }),
    });
    if (!res.ok) { setError((await res.json().catch(() => null))?.error ?? "Kaydedilemedi"); return; }
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/25 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="glass-strong w-full max-w-[460px] p-6" onClick={(e) => e.stopPropagation()}>
        <h3 className="mb-4 text-[16px] font-bold tracking-tight text-ink">Yeni azaltım eylemi</h3>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3.5">
          <Field label="başlık" error={errors.title?.message}>
            <input type="text" placeholder="örn. Sokak aydınlatması LED dönüşümü" {...register("title")} className={inputCls} />
          </Field>
          <Field label="açıklama (isteğe bağlı)">
            <textarea rows={2} {...register("description")} className={inputCls} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="hedef azaltım (tCO₂e/yıl)" error={errors.targetReductionTCO2e?.message}>
              <input type="number" step="any" {...register("targetReductionTCO2e", { valueAsNumber: true })} className={inputCls} />
            </Field>
            <Field label="bütçe (₺, isteğe bağlı)" error={errors.budgetTRY?.message}>
              <input type="number" step="any" {...register("budgetTRY", { setValueAs: (v) => (v === "" || v === null ? undefined : Number(v)) })} className={inputCls} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="sorumlu (isteğe bağlı)">
              <input type="text" {...register("owner")} className={inputCls} />
            </Field>
            <Field label="başlangıç yılı" error={errors.startYear?.message}>
              <input type="number" {...register("startYear", { setValueAs: (v) => (v === "" || v === null ? undefined : Number(v)) })} className={inputCls} />
            </Field>
          </div>
          {units.length > 0 && (
            <Field label="sorumlu müdürlük (isteğe bağlı)">
              <select {...register("unitId")} className={inputCls}>
                <option value="">— seçilmedi —</option>
                {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </Field>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Field label="başlangıç tarihi (isteğe bağlı)">
              <input type="date" {...register("startDate")} className={inputCls} />
            </Field>
            <Field label="bitiş tarihi (isteğe bağlı)">
              <input type="date" {...register("endDate")} className={inputCls} />
            </Field>
          </div>
          <Field label="risk notu (isteğe bağlı)">
            <input type="text" placeholder="örn. ihale takvimi riski" {...register("riskNote")} className={inputCls} />
          </Field>
          {error && <p className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-[12.5px] text-danger">{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" className={btnGhost} onClick={onClose}>vazgeç</button>
            <button type="submit" className={btnPrimary} disabled={isSubmitting}>{isSubmitting ? "kaydediliyor…" : "kaydet"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

const progressSchema = z.object({
  note: z.string().max(500).optional(),
  achievedTCO2e: z.number({ message: "Sayı girin" }).min(0, "Negatif olamaz"),
  spentTRY: z.number({ message: "Sayı girin" }).min(0).optional(),
});
type ProgressValues = z.infer<typeof progressSchema>;

function ProgressModal({ plan, initial, onClose, onSaved }: {
  plan: PlanView;
  initial?: PlanView["progress"][number];
  onClose: () => void;
  onSaved: () => void;
}) {
  useEsc(onClose);
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<ProgressValues>({
    resolver: zodResolver(progressSchema),
    defaultValues: initial
      ? { note: initial.note ?? "", achievedTCO2e: initial.achievedTCO2e, spentTRY: initial.spentTRY ?? undefined }
      : { note: "", achievedTCO2e: 0 },
  });

  async function onSubmit(v: ProgressValues) {
    setError(null);
    const res = await fetch(
      initial ? `/api/eylemler/${plan.id}/ilerleme/${initial.id}` : `/api/eylemler/${plan.id}/ilerleme`,
      {
        method: initial ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...v, spentTRY: v.spentTRY ?? null }),
      }
    );
    if (!res.ok) { setError((await res.json().catch(() => null))?.error ?? "Kaydedilemedi"); return; }
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/25 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="glass-strong w-full max-w-[420px] p-6" onClick={(e) => e.stopPropagation()}>
        <h3 className="mb-1 text-[16px] font-bold tracking-tight text-ink">{initial ? "İlerlemeyi düzenle" : "İlerleme ekle"}</h3>
        <p className="mb-4 truncate text-[12px] text-ink/50">{plan.title}</p>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3.5">
          <Field label="not (isteğe bağlı)">
            <input type="text" placeholder="örn. 2. etap devreye alındı" {...register("note")} className={inputCls} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="sağlanan azaltım (tCO₂e)" error={errors.achievedTCO2e?.message}>
              <input type="number" step="any" {...register("achievedTCO2e", { valueAsNumber: true })} className={inputCls} />
            </Field>
            <Field label="harcama (₺, isteğe bağlı)" error={errors.spentTRY?.message}>
              <input type="number" step="any" {...register("spentTRY", { setValueAs: (v) => (v === "" || v === null ? undefined : Number(v)) })} className={inputCls} />
            </Field>
          </div>
          {error && <p className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-[12.5px] text-danger">{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" className={btnGhost} onClick={onClose}>vazgeç</button>
            <button type="submit" className={btnPrimary} disabled={isSubmitting}>{isSubmitting ? "kaydediliyor…" : "kaydet"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
