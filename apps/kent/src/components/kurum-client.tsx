"use client";
/* Kurum yönetimi istemcisi — süper admin */
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Field, inputCls, btnPrimary, btnGhost } from "@/components/ui";
import { ORG_TYPES, ORG_TYPE_LABELS, type OrgType } from "@/lib/constants";

const schema = z.object({
  name: z.string().min(2, "En az 2 karakter"),
  type: z.enum(ORG_TYPES),
  baselineYear: z.number().int().min(2000, "2000-2100").max(2100, "2000-2100"),
  netZeroYear: z.number().int().min(2001, "2001-2100").max(2100, "2001-2100"),
});
type FormValues = z.infer<typeof schema>;

export function KurumEkleButonu() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { type: "BELEDIYE", baselineYear: 2024, netZeroYear: 2053 },
  });

  function close() {
    setOpen(false);
    setServerError(null);
    reset();
  }

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function onSubmit(v: FormValues) {
    setServerError(null);
    const res = await fetch("/api/kurumlar", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(v),
    });
    if (res.ok) { setOpen(false); reset(); router.refresh(); }
    else setServerError((await res.json().catch(() => null))?.error ?? "Kaydedilemedi");
  }

  return (
    <>
      <button type="button" className={btnPrimary} onClick={() => setOpen(true)}>+ yeni kurum</button>
      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-ink/30 p-4 backdrop-blur-sm" onClick={close}>
          <div className="glass-strong w-full max-w-md rounded-2xl p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-4 text-[15px] font-bold tracking-tight">Yeni kurum</h3>
            <form onSubmit={handleSubmit(onSubmit)} className="grid gap-3">
              <Field label="kurum adı" error={errors.name?.message}>
                <input {...register("name")} className={inputCls} placeholder="ör. Mavikent Belediyesi" />
              </Field>
              <Field label="kurum türü (ürün)" error={errors.type?.message}>
                <select {...register("type")} className={inputCls}>
                  {ORG_TYPES.map((t) => (
                    <option key={t} value={t}>{ORG_TYPE_LABELS[t].label} — {ORG_TYPE_LABELS[t].product}</option>
                  ))}
                </select>
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="baz yıl" error={errors.baselineYear?.message}>
                  <input type="number" {...register("baselineYear", { valueAsNumber: true })} className={inputCls} />
                </Field>
                <Field label="net-sıfır yılı" error={errors.netZeroYear?.message}>
                  <input type="number" {...register("netZeroYear", { valueAsNumber: true })} className={inputCls} />
                </Field>
              </div>
              {serverError && <p className="text-[12px] text-danger">{serverError}</p>}
              <div className="mt-1 flex justify-end gap-2">
                <button type="button" className={btnGhost} onClick={close}>vazgeç</button>
                <button type="submit" className={btnPrimary} disabled={isSubmitting}>
                  {isSubmitting ? "kaydediliyor…" : "kurum oluştur"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

export function KurumSilButonu({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function onDelete() {
    if (!confirm(`"${name}" kurumunu ve TÜM verilerini silmek istediğinize emin misiniz? Bu işlem geri alınamaz.`)) return;
    setBusy(true);
    const res = await fetch("/api/kurumlar", {
      method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }),
    });
    setBusy(false);
    if (res.ok) router.refresh();
    else alert((await res.json().catch(() => null))?.error ?? "Silinemedi");
  }
  return (
    <button type="button" onClick={onDelete} disabled={busy}
      className="cursor-pointer rounded-lg px-2 py-1 text-[11.5px] text-danger/60 transition hover:bg-red-50 hover:text-danger">
      sil
    </button>
  );
}

export function KurumTuruEtiketi({ type }: { type: string }) {
  const meta = ORG_TYPE_LABELS[type as OrgType];
  if (!meta) return <span>{type}</span>;
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="rounded-md bg-leaf-50 px-1.5 py-0.5 text-[10.5px] font-semibold text-leaf-700 ring-1 ring-leaf-200/60">
        {meta.product}
      </span>
      <span className="text-ink/50">{meta.label}</span>
    </span>
  );
}
