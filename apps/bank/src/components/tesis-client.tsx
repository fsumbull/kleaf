"use client";
/* Tesis yaşam döngüsü istemcisi — ekle / düzenle / sil (admin rolleri) */
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Field, inputCls, btnPrimary, btnGhost } from "@/components/ui";
import { FACILITY_TYPES, FACILITY_TYPE_LABELS } from "@/lib/constants";

const schema = z.object({
  name: z.string().min(2, "En az 2 karakter"),
  type: z.enum(FACILITY_TYPES),
  areaM2: z.number({ message: "Geçersiz alan" }).min(1).max(5_000_000).optional(),
  staffCount: z.number({ message: "Geçersiz sayı" }).int().min(1).max(1_000_000).optional(),
  unitId: z.string().optional(),
  installedKwp: z.number({ message: "Geçersiz güç" }).min(0.1).max(1_000_000).optional(),
  commissionYear: z.number({ message: "1990-2100" }).int().min(1990).max(2100).optional(),
  capexTRY: z.number({ message: "Geçersiz tutar" }).min(1).max(100_000_000_000).optional(),
});
type FormValues = z.infer<typeof schema>;

export interface TesisDto {
  id: string;
  name: string;
  type: string;
  areaM2: number | null;
  staffCount: number | null;
  unitId: string | null;
  installedKwp: number | null;
  commissionYear: number | null;
  capexTRY: number | null;
}

interface UnitOpt { id: string; name: string }

const numReg = { setValueAs: (v: unknown) => (v === "" || v === null ? undefined : Number(v)) };

function TesisModal({ orgId, units, initial, onClose }: {
  orgId: string; units: UnitOpt[]; initial?: TesisDto; onClose: () => void;
}) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const { register, handleSubmit, watch, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: initial
      ? {
          name: initial.name,
          type: initial.type as FormValues["type"],
          areaM2: initial.areaM2 ?? undefined,
          staffCount: initial.staffCount ?? undefined,
          unitId: initial.unitId ?? "",
          installedKwp: initial.installedKwp ?? undefined,
          commissionYear: initial.commissionYear ?? undefined,
          capexTRY: initial.capexTRY ?? undefined,
        }
      : { type: "BINA", unitId: "" },
  });
  const tip = watch("type");

  // ESC ile kapat
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  async function onSubmit(v: FormValues) {
    setServerError(null);
    const payload = {
      ...(initial ? { id: initial.id } : { orgId }),
      name: v.name,
      type: v.type,
      areaM2: v.areaM2 ?? null,
      staffCount: v.staffCount ?? null,
      unitId: v.unitId || null,
      installedKwp: v.type === "GES" ? v.installedKwp ?? null : null,
      commissionYear: v.type === "GES" ? v.commissionYear ?? null : null,
      capexTRY: v.type === "GES" ? v.capexTRY ?? null : null,
    };
    const res = await fetch("/api/tesisler", {
      method: initial ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (res.ok) { onClose(); router.refresh(); }
    else setServerError((await res.json().catch(() => null))?.error ?? "Kaydedilemedi");
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/30 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="glass-strong max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl p-6" onClick={(e) => e.stopPropagation()}>
        <h3 className="mb-4 text-[15px] font-bold tracking-tight">{initial ? "Tesisi düzenle" : "Yeni tesis"}</h3>
        <form onSubmit={handleSubmit(onSubmit)} className="grid gap-3">
          <Field label="tesis adı" error={errors.name?.message}>
            <input {...register("name")} className={inputCls} placeholder="ör. Hizmet Binası B" />
          </Field>
          <Field label="tesis türü" error={errors.type?.message}>
            <select {...register("type")} className={inputCls}>
              {FACILITY_TYPES.map((t) => (
                <option key={t} value={t}>{FACILITY_TYPE_LABELS[t]}</option>
              ))}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="alan (m², ops.)" error={errors.areaM2?.message}>
              <input type="number" step="any" {...register("areaM2", numReg)} className={inputCls} />
            </Field>
            <Field label="personel (ops.)" error={errors.staffCount?.message}>
              <input type="number" {...register("staffCount", numReg)} className={inputCls} />
            </Field>
          </div>
          <Field label="bağlı birim (ops.)">
            <select {...register("unitId")} className={inputCls}>
              <option value="">— birim yok —</option>
              {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </Field>
          {tip === "GES" && (
            <div className="rounded-xl bg-leaf-50/60 p-3 ring-1 ring-leaf-200/50">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-leaf-700">GES künyesi</p>
              <div className="grid grid-cols-3 gap-2">
                <Field label="kurulu güç (kWp)" error={errors.installedKwp?.message}>
                  <input type="number" step="any" {...register("installedKwp", numReg)} className={inputCls} />
                </Field>
                <Field label="devreye alma" error={errors.commissionYear?.message}>
                  <input type="number" {...register("commissionYear", numReg)} className={inputCls} placeholder="2025" />
                </Field>
                <Field label="yatırım (₺)" error={errors.capexTRY?.message}>
                  <input type="number" step="any" {...register("capexTRY", numReg)} className={inputCls} />
                </Field>
              </div>
            </div>
          )}
          {serverError && <p className="text-[12px] text-danger">{serverError}</p>}
          <div className="mt-1 flex justify-end gap-2">
            <button type="button" className={btnGhost} onClick={onClose}>vazgeç</button>
            <button type="submit" className={btnPrimary} disabled={isSubmitting}>
              {isSubmitting ? "kaydediliyor…" : initial ? "güncelle" : "tesis oluştur"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function TesisEkleButonu({ orgId, units }: { orgId: string; units: UnitOpt[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={btnPrimary} onClick={() => setOpen(true)}>+ yeni tesis</button>
      {open && <TesisModal orgId={orgId} units={units} onClose={() => setOpen(false)} />}
    </>
  );
}

export function TesisKartAksiyonlari({ tesis, orgId, units, recordCount }: {
  tesis: TesisDto; orgId: string; units: UnitOpt[]; recordCount: number;
}) {
  const router = useRouter();
  const [edit, setEdit] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onDelete() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/tesisler?force=1`, {
      method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: tesis.id }),
    });
    setBusy(false);
    if (res.ok) { setConfirmDel(false); router.refresh(); }
    else setError((await res.json().catch(() => null))?.error ?? "Silinemedi");
  }

  return (
    <div className="mt-3 flex items-center gap-1 border-t border-leaf-100/70 pt-2.5">
      <button
        type="button"
        onClick={() => setEdit(true)}
        className="cursor-pointer rounded-lg px-2 py-1 text-[11.5px] text-ink/50 transition hover:bg-leaf-50 hover:text-leaf-800"
      >
        düzenle
      </button>
      <button
        type="button"
        onClick={() => setConfirmDel(true)}
        className="cursor-pointer rounded-lg px-2 py-1 text-[11.5px] text-danger/60 transition hover:bg-red-50 hover:text-danger"
      >
        sil
      </button>
      {edit && <TesisModal orgId={orgId} units={units} initial={tesis} onClose={() => setEdit(false)} />}
      {confirmDel && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-ink/30 p-4 backdrop-blur-sm" onClick={() => setConfirmDel(false)}>
          <div className="glass-strong w-full max-w-sm rounded-2xl p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-[15px] font-bold tracking-tight">Tesisi sil</h3>
            <p className="mt-2 text-[13px] text-ink/60">
              <span className="font-semibold text-ink">{tesis.name}</span> silinecek.
              {recordCount > 0 ? (
                <> Tesise bağlı <span className="font-semibold text-danger">{recordCount} faaliyet kaydı</span> ve
                hesap izleri de kalıcı olarak silinir.</>
              ) : (
                <> Bu tesiste faaliyet kaydı yok.</>
              )}
            </p>
            {error && <p className="mt-2 text-[12px] text-danger">{error}</p>}
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className={btnGhost} onClick={() => setConfirmDel(false)}>vazgeç</button>
              <button
                type="button"
                onClick={onDelete}
                disabled={busy}
                className="cursor-pointer rounded-xl bg-danger px-4 py-2 text-[13px] font-semibold text-white transition hover:bg-red-700 disabled:opacity-50"
              >
                {busy ? "siliniyor…" : recordCount > 0 ? `${recordCount} kayıtla birlikte sil` : "sil"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
