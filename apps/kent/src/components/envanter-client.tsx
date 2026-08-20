"use client";
/* Envanter kataloğu istemcisi — grup akordeonu, arama/filtre, kalem ekleme/düzenleme, şablondan aktarma */
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Badge, Field, inputCls, btnPrimary, btnGhost } from "@/components/ui";
import {
  CATEGORIES, CATEGORY_CODES, ISO_CATEGORIES, ISO_CATEGORY_LABELS,
  INVENTORY_MODES, INVENTORY_MODE_LABELS,
} from "@/lib/constants";

export interface KalemDto {
  id: string; name: string; unitName: string; dataUnit: string;
  isoCategory: string; mode: string; categoryCode: string | null;
  customFactorKgCO2e: number | null; active: boolean;
  groupCode: string; groupName: string; groupOrder: number;
}
interface GrupOpt { code: string; name: string }
interface UnitOpt { id: string; name: string }

/* ── şablondan içe aktarma ── */
export function SablonAktarButonu({ sablonSayisi, birincil }: { sablonSayisi: number; birincil?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function aktar() {
    if (!confirm(`Küresel şablondaki ${sablonSayisi} kalem kurumunuza kopyalanacak (mevcut olanlar atlanır). Devam edilsin mi?`)) return;
    setBusy(true); setMsg(null);
    const res = await fetch("/api/envanter/ice-aktar", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}),
    });
    const j = await res.json().catch(() => null);
    setBusy(false);
    if (res.ok) { setMsg(`${j.eklenen} kalem aktarıldı${j.atlanan ? `, ${j.atlanan} zaten vardı` : ""}`); router.refresh(); }
    else setMsg(j?.error ?? "Aktarım başarısız");
  }

  return (
    <span className="inline-flex items-center gap-2">
      {msg && <span className="text-[11px] text-ink/50">{msg}</span>}
      <button type="button" onClick={aktar} disabled={busy || sablonSayisi === 0} className={birincil ? btnPrimary : btnGhost}>
        {busy ? "aktarılıyor…" : "şablondan içe aktar"}
      </button>
    </span>
  );
}

/* ── kalem formu ── */
const schema = z.object({
  name: z.string().min(3, "En az 3 karakter"),
  groupCode: z.string().min(1, "Grup seçin"),
  unitId: z.string().optional(),
  unitName: z.string().optional(),
  dataUnit: z.string().min(1, "Veri birimi girin"),
  isoCategory: z.enum(ISO_CATEGORIES),
  mode: z.enum(INVENTORY_MODES),
  categoryCode: z.string().optional(),
  customFactorKgCO2e: z.number({ message: "Geçersiz faktör" }).min(0, "Negatif olamaz").optional(),
});
type FormValues = z.infer<typeof schema>;
const numReg = { setValueAs: (v: unknown) => (v === "" || v === null ? undefined : Number(v)) };

function KalemModal({ groups, units, initial, onClose }: {
  groups: GrupOpt[]; units: UnitOpt[]; initial?: KalemDto; onClose: () => void;
}) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const { register, handleSubmit, watch, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: initial
      ? {
          name: initial.name, groupCode: initial.groupCode, unitId: "", unitName: initial.unitName,
          dataUnit: initial.dataUnit, isoCategory: initial.isoCategory as FormValues["isoCategory"],
          mode: initial.mode as FormValues["mode"], categoryCode: initial.categoryCode ?? "",
          customFactorKgCO2e: initial.customFactorKgCO2e ?? undefined,
        }
      : { groupCode: groups[0]?.code ?? "", unitId: "", isoCategory: "CAT1_2", mode: "IZLEME", categoryCode: "" },
  });
  const mode = watch("mode");

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  async function onSubmit(v: FormValues) {
    setServerError(null);
    if (v.mode === "HESAPLANABILIR" && !v.categoryCode) { setServerError("Hesaplanabilir kalem için emisyon kategorisi seçin"); return; }
    const payload = initial
      ? {
          id: initial.id, name: v.name, dataUnit: v.dataUnit, isoCategory: v.isoCategory, mode: v.mode,
          categoryCode: v.mode === "HESAPLANABILIR" ? v.categoryCode : null,
          customFactorKgCO2e: v.customFactorKgCO2e ?? null,
          ...(v.unitId ? { unitId: v.unitId } : {}),
        }
      : {
          name: v.name, groupCode: v.groupCode, dataUnit: v.dataUnit, isoCategory: v.isoCategory, mode: v.mode,
          categoryCode: v.mode === "HESAPLANABILIR" ? v.categoryCode || null : null,
          customFactorKgCO2e: v.customFactorKgCO2e ?? null,
          ...(v.unitId ? { unitId: v.unitId } : { unitName: v.unitName || "Genel" }),
        };
    const res = await fetch("/api/envanter", {
      method: initial ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (res.ok) { onClose(); router.refresh(); }
    else setServerError((await res.json().catch(() => null))?.error ?? "Kaydedilemedi");
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/30 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="glass-strong max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl p-6" onClick={(e) => e.stopPropagation()}>
        <h3 className="mb-4 text-[15px] font-bold tracking-tight">{initial ? "Kalemi düzenle" : "Yeni envanter kalemi"}</h3>
        <form onSubmit={handleSubmit(onSubmit)} className="grid gap-3">
          <Field label="kalem adı" error={errors.name?.message}>
            <input {...register("name")} className={inputCls} placeholder="ör. Hizmet binası elektrik tüketimi" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            {!initial && (
              <Field label="envanter grubu" error={errors.groupCode?.message}>
                <select {...register("groupCode")} className={inputCls}>
                  {groups.map((g) => <option key={g.code} value={g.code}>{g.name}</option>)}
                </select>
              </Field>
            )}
            <Field label="sorumlu birim">
              <select {...register("unitId")} className={inputCls}>
                <option value="">— birim seçilmedi —</option>
                {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </Field>
            <Field label="veri birimi" error={errors.dataUnit?.message}>
              <input {...register("dataUnit")} className={inputCls} placeholder="ör. kWh / ay" />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="ISO 14064 kategorisi">
              <select {...register("isoCategory")} className={inputCls}>
                {ISO_CATEGORIES.map((c) => <option key={c} value={c}>{ISO_CATEGORY_LABELS[c]}</option>)}
              </select>
            </Field>
            <Field label="izleme türü">
              <select {...register("mode")} className={inputCls}>
                {INVENTORY_MODES.map((m) => <option key={m} value={m}>{INVENTORY_MODE_LABELS[m]}</option>)}
              </select>
            </Field>
          </div>
          {mode === "HESAPLANABILIR" && (
            <div className="rounded-xl bg-leaf-50/60 p-3 ring-1 ring-leaf-200/50">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-leaf-700">hesaplama bağlantısı</p>
              <div className="grid grid-cols-2 gap-2">
                <Field label="emisyon kategorisi">
                  <select {...register("categoryCode")} className={inputCls}>
                    <option value="">— seçin —</option>
                    {CATEGORY_CODES.map((c) => (
                      <option key={c} value={c}>{CATEGORIES.find((x) => x.code === c)?.label ?? c}</option>
                    ))}
                  </select>
                </Field>
                <Field label="özel faktör (kgCO₂e/birim, ops.)" error={errors.customFactorKgCO2e?.message}>
                  <input type="number" step="any" {...register("customFactorKgCO2e", numReg)} className={inputCls} placeholder="boş → kütüphane faktörü" />
                </Field>
              </div>
            </div>
          )}
          {serverError && <p className="text-[12px] text-danger">{serverError}</p>}
          <div className="mt-1 flex justify-end gap-2">
            <button type="button" className={btnGhost} onClick={onClose}>vazgeç</button>
            <button type="submit" className={btnPrimary} disabled={isSubmitting}>
              {isSubmitting ? "kaydediliyor…" : initial ? "güncelle" : "kalem ekle"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function KalemEkleButonu({ groups, units }: { groups: GrupOpt[]; units: UnitOpt[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={btnPrimary} onClick={() => setOpen(true)}>+ yeni kalem</button>
      {open && <KalemModal groups={groups} units={units} onClose={() => setOpen(false)} />}
    </>
  );
}

/* ── katalog görünümü ── */
export function EnvanterKatalog({ items, canManage, groups, units }: {
  items: KalemDto[]; canManage: boolean; groups: GrupOpt[]; units: UnitOpt[];
}) {
  const router = useRouter();
  const [arama, setArama] = useState("");
  const [birim, setBirim] = useState("");
  const [pasifGoster, setPasifGoster] = useState(false);
  const [duzenle, setDuzenle] = useState<KalemDto | null>(null);
  const [acik, setAcik] = useState<Set<string>>(new Set());

  const birimler = useMemo(() => Array.from(new Set(items.map((i) => i.unitName))).sort((a, b) => a.localeCompare(b, "tr")), [items]);

  const filtreli = useMemo(() => {
    const q = arama.trim().toLocaleLowerCase("tr-TR");
    return items.filter((i) =>
      (pasifGoster || i.active) &&
      (!birim || i.unitName === birim) &&
      (!q || i.name.toLocaleLowerCase("tr-TR").includes(q) || i.unitName.toLocaleLowerCase("tr-TR").includes(q))
    );
  }, [items, arama, birim, pasifGoster]);

  const gruplar = useMemo(() => {
    const map = new Map<string, { name: string; order: number; items: KalemDto[] }>();
    for (const i of filtreli) {
      const g = map.get(i.groupCode) ?? { name: i.groupName, order: i.groupOrder, items: [] };
      g.items.push(i);
      map.set(i.groupCode, g);
    }
    return Array.from(map.entries()).sort((a, b) => a[1].order - b[1].order);
  }, [filtreli]);

  async function pasifYap(k: KalemDto) {
    if (!confirm(`"${k.name}" ${k.active ? "pasifleştirilecek — yeni veri girişi engellenir, geçmiş korunur" : "yeniden aktifleştirilecek"}. Devam edilsin mi?`)) return;
    const res = await fetch("/api/envanter", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: k.id, active: !k.active }),
    });
    if (res.ok) router.refresh();
    else alert((await res.json().catch(() => null))?.error ?? "İşlem başarısız");
  }

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={arama} onChange={(e) => setArama(e.target.value)}
          className={`${inputCls} max-w-xs`} placeholder="kalem ya da birim ara…"
        />
        <select value={birim} onChange={(e) => setBirim(e.target.value)} className={`${inputCls} max-w-[260px]`}>
          <option value="">tüm birimler ({birimler.length})</option>
          {birimler.map((b) => <option key={b} value={b}>{b}</option>)}
        </select>
        <label className="inline-flex cursor-pointer items-center gap-1.5 text-[12px] text-ink/60">
          <input type="checkbox" checked={pasifGoster} onChange={(e) => setPasifGoster(e.target.checked)} className="accent-leaf-600" />
          pasifleri göster
        </label>
        <span className="ml-auto text-[12px] text-ink/45">{filtreli.length} kalem</span>
      </div>

      {gruplar.map(([code, g]) => {
        const open = acik.has(code) || !!arama || !!birim;
        return (
          <div key={code} className="glass overflow-hidden rounded-2xl rise-1">
            <button
              type="button"
              onClick={() => setAcik((s) => { const n = new Set(s); if (n.has(code)) n.delete(code); else n.add(code); return n; })}
              className="flex w-full cursor-pointer items-center justify-between px-5 py-3.5 text-left transition hover:bg-leaf-50/50"
            >
              <span className="text-[13.5px] font-semibold tracking-tight">{g.name}</span>
              <span className="flex items-center gap-3">
                <span className="text-[11.5px] text-ink/40">
                  {g.items.length} kalem · {g.items.filter((i) => i.mode === "HESAPLANABILIR").length} hesaplanabilir
                </span>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                  className={`text-ink/40 transition ${open ? "rotate-180" : ""}`}><path d="M6 9l6 6 6-6" /></svg>
              </span>
            </button>
            {open && (
              <div className="overflow-x-auto border-t border-leaf-200/40">
                <table className="w-full text-[12.5px]">
                  <thead>
                    <tr className="text-left text-[10.5px] uppercase tracking-wider text-ink/40">
                      <th className="px-5 py-2">kalem</th>
                      <th className="px-3 py-2">birim</th>
                      <th className="px-3 py-2">veri birimi</th>
                      <th className="px-3 py-2">ISO</th>
                      <th className="px-3 py-2">tür</th>
                      {canManage && <th className="px-3 py-2 text-right">işlem</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {g.items.map((k) => (
                      <tr key={k.id} className={`border-t border-leaf-200/30 ${k.active ? "" : "opacity-45"}`}>
                        <td className="px-5 py-2.5 font-medium">{k.name}</td>
                        <td className="px-3 py-2.5 text-ink/60">{k.unitName}</td>
                        <td className="px-3 py-2.5 text-ink/60">{k.dataUnit}</td>
                        <td className="px-3 py-2.5">
                          <Badge tone="gray">{ISO_CATEGORY_LABELS[k.isoCategory as keyof typeof ISO_CATEGORY_LABELS] ?? k.isoCategory}</Badge>
                        </td>
                        <td className="px-3 py-2.5">
                          {k.mode === "HESAPLANABILIR"
                            ? <Badge tone="leaf">hesaplanabilir{k.customFactorKgCO2e != null ? " · özel faktör" : ""}</Badge>
                            : <Badge tone="warm">izleme</Badge>}
                        </td>
                        {canManage && (
                          <td className="px-3 py-2.5 text-right whitespace-nowrap">
                            <button type="button" onClick={() => setDuzenle(k)} className="cursor-pointer text-[11.5px] font-medium text-leaf-700 hover:underline">düzenle</button>
                            <button type="button" onClick={() => pasifYap(k)} className={`ml-3 cursor-pointer text-[11.5px] font-medium hover:underline ${k.active ? "text-danger" : "text-leaf-700"}`}>
                              {k.active ? "pasifleştir" : "aktifleştir"}
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })}

      {duzenle && <KalemModal groups={groups} units={units} initial={duzenle} onClose={() => setDuzenle(null)} />}
    </div>
  );
}
