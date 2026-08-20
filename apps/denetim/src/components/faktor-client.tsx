"use client";
/* Faktör kütüphanesi istemcisi — kurum faktörü ekleme/düzenleme/silme */
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Field, inputCls, btnPrimary, btnGhost } from "@/components/ui";
import { CATEGORIES } from "@/lib/constants";

const KAYNAKLAR = ["TEİAŞ", "IPCC", "DEFRA", "TÜİK"];

const factorValue = z
  .number({ message: "Geçerli bir sayı girin" })
  .min(0.0001, "Faktör 0.0001'den küçük olamaz")
  .max(10000, "Faktör 10000'den büyük olamaz");

const schema = z.object({
  category: z.string().min(1),
  kgCO2ePerUnit: factorValue,
  source: z.string().min(1, "Kaynak belirtin").max(200),
  year: z.number({ message: "Geçersiz yıl" }).int().min(1990).max(2100),
});
type Values = z.infer<typeof schema>;

function SourceDatalist() {
  return (
    <datalist id="faktor-kaynaklar">
      {KAYNAKLAR.map((k) => <option key={k} value={k} />)}
    </datalist>
  );
}

function ModalShell({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/25 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="glass-strong w-full max-w-[420px] p-6" onClick={(e) => e.stopPropagation()}>{children}</div>
    </div>
  );
}

export function FactorActions({ orgId, canManage }: { orgId: string; canManage: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, watch, reset, formState: { errors, isSubmitting } } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { category: "ELEKTRIK", kgCO2ePerUnit: 0, source: "", year: 2026 },
  });
  const selected = CATEGORIES.find((c) => c.code === watch("category"));

  if (!canManage) return null;

  function close() {
    reset();
    setError(null);
    setOpen(false);
  }

  async function onSubmit(v: Values) {
    setError(null);
    const res = await fetch("/api/faktorler", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...v, orgId }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setError(data?.error ?? "Kaydedilemedi");
      return;
    }
    close();
    router.refresh();
  }

  return (
    <>
      <button type="button" className={btnPrimary} onClick={() => setOpen(true)}>+ kurum faktörü</button>
      {open && (
        <ModalShell onClose={close}>
          <h3 className="mb-1 text-[16px] font-bold tracking-tight text-ink">Kuruma özel faktör</h3>
          <p className="mb-4 text-[12px] text-ink/50">
            Bu tanım, seçilen kategori için küresel varsayılanı <b>geçersiz kılar</b>; sonraki onaylarda kullanılır.
          </p>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-3.5">
            <Field label="kategori">
              <select {...register("category")} className={inputCls}>
                {CATEGORIES.map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}
              </select>
            </Field>
            <Field label={`faktör (kgCO₂e / ${selected?.unit ?? "birim"})`} error={errors.kgCO2ePerUnit?.message}>
              <input type="number" step="any" {...register("kgCO2ePerUnit", { valueAsNumber: true })} className={inputCls} />
            </Field>
            <div className="grid grid-cols-[1fr_110px] gap-3">
              <Field label="kaynak" error={errors.source?.message}>
                <input type="text" list="faktor-kaynaklar" placeholder="örn. TEİAŞ 2025 şebeke faktörü" {...register("source")} className={inputCls} />
              </Field>
              <Field label="yıl" error={errors.year?.message}>
                <input type="number" {...register("year", { valueAsNumber: true })} className={inputCls} />
              </Field>
            </div>
            <SourceDatalist />
            {error && <p className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-[12.5px] text-danger">{error}</p>}
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" className={btnGhost} onClick={close}>vazgeç</button>
              <button type="submit" className={btnPrimary} disabled={isSubmitting}>
                {isSubmitting ? "kaydediliyor…" : "kaydet"}
              </button>
            </div>
          </form>
        </ModalShell>
      )}
    </>
  );
}

const editSchema = schema.omit({ category: true });
type EditValues = z.infer<typeof editSchema>;

export function EditFactorButton({ factor }: {
  factor: { id: string; category: string; categoryLabel: string; unit: string; kgCO2ePerUnit: number; source: string; year: number };
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<EditValues>({
    resolver: zodResolver(editSchema),
    defaultValues: { kgCO2ePerUnit: factor.kgCO2ePerUnit, source: factor.source, year: factor.year },
  });

  function close() {
    reset({ kgCO2ePerUnit: factor.kgCO2ePerUnit, source: factor.source, year: factor.year });
    setError(null);
    setOpen(false);
  }

  async function onSubmit(v: EditValues) {
    setError(null);
    const res = await fetch("/api/faktorler", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: factor.id, ...v }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setError(data?.error ?? "Kaydedilemedi");
      return;
    }
    setOpen(false);
    setError(null);
    router.refresh();
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)}
        className="cursor-pointer rounded-lg px-2 py-1 text-[11.5px] font-medium text-ink/60 transition hover:bg-leaf-50 hover:text-leaf-800">
        düzenle
      </button>
      {open && (
        <ModalShell onClose={close}>
          <h3 className="mb-1 text-[16px] font-bold tracking-tight text-ink">Faktörü düzenle</h3>
          <p className="mb-4 text-[12px] text-ink/50">
            {factor.categoryLabel} — geçmiş onaylar etkilenmez (snapshot); yeni değer sonraki onaylarda kullanılır.
          </p>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-3.5">
            <Field label={`faktör (kgCO₂e / ${factor.unit})`} error={errors.kgCO2ePerUnit?.message}>
              <input type="number" step="any" {...register("kgCO2ePerUnit", { valueAsNumber: true })} className={inputCls} />
            </Field>
            <div className="grid grid-cols-[1fr_110px] gap-3">
              <Field label="kaynak" error={errors.source?.message}>
                <input type="text" list="faktor-kaynaklar" {...register("source")} className={inputCls} />
              </Field>
              <Field label="yıl" error={errors.year?.message}>
                <input type="number" {...register("year", { valueAsNumber: true })} className={inputCls} />
              </Field>
            </div>
            <SourceDatalist />
            {error && <p className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-[12.5px] text-danger">{error}</p>}
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" className={btnGhost} onClick={close}>vazgeç</button>
              <button type="submit" className={btnPrimary} disabled={isSubmitting}>
                {isSubmitting ? "kaydediliyor…" : "kaydet"}
              </button>
            </div>
          </form>
        </ModalShell>
      )}
    </>
  );
}

export function DeleteFactorButton({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function onDelete() {
    if (!confirm("Kurum faktörü silinsin mi? Sonraki onaylar küresel varsayılana döner.")) return;
    setBusy(true);
    await fetch("/api/faktorler", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    router.refresh();
  }
  return (
    <button type="button" onClick={onDelete} disabled={busy}
      className="cursor-pointer rounded-lg px-2 py-1 text-[11.5px] font-medium text-danger/70 transition hover:bg-red-50 hover:text-danger disabled:opacity-50">
      sil
    </button>
  );
}
