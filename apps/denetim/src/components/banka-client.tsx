"use client";
/* KarbonBank istemcisi — havuz CRUD, talep onay/red, portföy grafikleri */
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import Chart from "@/components/chart";
import { Card, CardTitle, Badge, Field, inputCls, btnPrimary, btnGhost, EmptyState } from "@/components/ui";
import { CREDIT_STANDARDS, CREDIT_STANDARD_LABELS, CREDIT_STATUS_LABELS, type CreditStandard, type CreditStatus } from "@/lib/constants";
import { fmt1 } from "@/lib/format";

export interface HavuzDto {
  id: string; projectName: string; standard: string; vintageYear: number;
  totalTCO2e: number; availableTCO2e: number; priceTRYPerTon: number; active: boolean;
}
export interface BankaIslemDto {
  id: string; status: string; amountTCO2e: number; priceTRYPerTon: number;
  requestNote: string | null; decisionNote: string | null; createdAt: string;
  pool: { projectName: string; standard: string; vintageYear: number; availableTCO2e: number };
  buyerOrg: string;
}

const statusTone = (s: string): "leaf" | "warm" | "gray" | "danger" =>
  s === "TRANSFER" ? "leaf" : s === "TALEP" ? "warm" : s === "BANKA_ONAY" ? "leaf" : s === "RED" ? "danger" : "gray";

/* ── havuz formu ── */
const havuzSchema = z.object({
  projectName: z.string().min(3, "En az 3 karakter"),
  standard: z.enum(CREDIT_STANDARDS),
  vintageYear: z.number({ message: "Yıl girin" }).int().min(2000).max(2100),
  totalTCO2e: z.number({ message: "Kapasite girin" }).positive("Pozitif olmalı"),
  priceTRYPerTon: z.number({ message: "Fiyat girin" }).positive("Pozitif olmalı"),
});
type HavuzForm = z.infer<typeof havuzSchema>;
const numReg = { setValueAs: (v: unknown) => (v === "" || v === null ? undefined : Number(v)) };

function HavuzModal({ initial, onClose }: { initial?: HavuzDto; onClose: () => void }) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const [ekKapasite, setEkKapasite] = useState("");
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<HavuzForm>({
    resolver: zodResolver(havuzSchema),
    defaultValues: initial
      ? {
          projectName: initial.projectName, standard: initial.standard as CreditStandard,
          vintageYear: initial.vintageYear, totalTCO2e: initial.totalTCO2e, priceTRYPerTon: initial.priceTRYPerTon,
        }
      : { standard: "GOLD_STANDARD", vintageYear: new Date().getFullYear() },
  });

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  async function onSubmit(v: HavuzForm) {
    setServerError(null);
    const ek = Number(ekKapasite);
    const payload = initial
      ? {
          id: initial.id, projectName: v.projectName, priceTRYPerTon: v.priceTRYPerTon,
          ...(ekKapasite && ek > 0 ? { ekKapasiteTCO2e: ek } : {}),
        }
      : v;
    const res = await fetch("/api/banka/havuzlar", {
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
        <h3 className="mb-4 text-[15px] font-bold tracking-tight">{initial ? "Havuzu düzenle" : "Yeni kredi havuzu"}</h3>
        <form onSubmit={handleSubmit(onSubmit)} className="grid gap-3">
          <Field label="proje adı" error={errors.projectName?.message}>
            <input {...register("projectName")} className={inputCls} placeholder="ör. Çamlıca Ağaçlandırma Projesi" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="standart">
              <select {...register("standard")} className={inputCls} disabled={!!initial}>
                {CREDIT_STANDARDS.map((s) => <option key={s} value={s}>{CREDIT_STANDARD_LABELS[s]}</option>)}
              </select>
            </Field>
            <Field label="vintage yılı" error={errors.vintageYear?.message}>
              <input type="number" {...register("vintageYear", numReg)} className={inputCls} disabled={!!initial} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {initial ? (
              <Field label="ek kapasite (tCO₂e, ops.)">
                <input type="number" step="any" min="0" value={ekKapasite} onChange={(e) => setEkKapasite(e.target.value)} className={inputCls} placeholder="mevcuda eklenir" />
              </Field>
            ) : (
              <Field label="kapasite (tCO₂e)" error={errors.totalTCO2e?.message}>
                <input type="number" step="any" {...register("totalTCO2e", numReg)} className={inputCls} />
              </Field>
            )}
            <Field label="fiyat (₺/tCO₂e)" error={errors.priceTRYPerTon?.message}>
              <input type="number" step="any" {...register("priceTRYPerTon", numReg)} className={inputCls} />
            </Field>
          </div>
          {serverError && <p className="text-[12px] text-danger">{serverError}</p>}
          <div className="mt-1 flex justify-end gap-2">
            <button type="button" className={btnGhost} onClick={onClose}>vazgeç</button>
            <button type="submit" className={btnPrimary} disabled={isSubmitting}>
              {isSubmitting ? "kaydediliyor…" : initial ? "güncelle" : "havuz oluştur"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function HavuzEkleButonu({ birincil }: { birincil?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={birincil ? btnPrimary : btnPrimary} onClick={() => setOpen(true)}>+ yeni havuz</button>
      {open && <HavuzModal onClose={() => setOpen(false)} />}
    </>
  );
}

/* ── karar düğmeleri ── */
function TalepKarar({ islem }: { islem: BankaIslemDto }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function karar(k: "BANKA_ONAY" | "RED") {
    const not = k === "RED" ? prompt("Red gerekçesi (ops.):") ?? undefined : undefined;
    if (k === "RED" && not === undefined && !confirm("Gerekçesiz reddedilsin mi?")) return;
    setBusy(k); setErr(null);
    const res = await fetch("/api/banka/talepler", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: islem.id, karar: k, ...(not ? { decisionNote: not } : {}) }),
    });
    setBusy(null);
    if (res.ok) router.refresh();
    else setErr((await res.json().catch(() => null))?.error ?? "İşlem başarısız");
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button type="button" disabled={!!busy} onClick={() => karar("BANKA_ONAY")}
        className="cursor-pointer rounded-full border border-leaf-200 bg-leaf-100 px-2.5 py-0.5 text-[11px] font-medium text-leaf-700 transition hover:bg-leaf-200">
        {busy === "BANKA_ONAY" ? "…" : "onayla"}
      </button>
      <button type="button" disabled={!!busy} onClick={() => karar("RED")}
        className="cursor-pointer rounded-full border border-red-200 bg-red-50 px-2.5 py-0.5 text-[11px] font-medium text-danger transition hover:bg-red-100">
        {busy === "RED" ? "…" : "reddet"}
      </button>
      {err && <span className="text-[11px] text-danger">{err}</span>}
    </span>
  );
}

/* ── ana panel ── */
export function BankaPaneli({ pools, islemler, canManage }: {
  pools: HavuzDto[]; islemler: BankaIslemDto[]; canManage: boolean;
}) {
  const router = useRouter();
  const [duzenle, setDuzenle] = useState<HavuzDto | null>(null);
  const bekleyenler = islemler.filter((t) => t.status === "TALEP");
  const gecmis = islemler.filter((t) => t.status !== "TALEP");

  const doluluk = useMemo(() => pools.filter((p) => p.active).map((p) => ({
    name: p.projectName,
    satilan: p.totalTCO2e - p.availableTCO2e,
    kalan: p.availableTCO2e,
  })), [pools]);

  const standartDagilim = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of pools.filter((x) => x.active))
      m.set(p.standard, (m.get(p.standard) ?? 0) + p.availableTCO2e);
    return Array.from(m.entries()).map(([k, v]) => ({
      name: CREDIT_STANDARD_LABELS[k as CreditStandard] ?? k, value: Math.round(v * 10) / 10,
    }));
  }, [pools]);

  async function havuzPasif(p: HavuzDto) {
    if (!confirm(`"${p.projectName}" ${p.active ? "vitrinden kaldırılacak" : "yeniden vitrine alınacak"}. Devam edilsin mi?`)) return;
    const res = await fetch("/api/banka/havuzlar", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: p.id, active: !p.active }),
    });
    if (res.ok) router.refresh();
    else alert((await res.json().catch(() => null))?.error ?? "İşlem başarısız");
  }

  return (
    <div className="grid gap-5">
      {bekleyenler.length > 0 && (
        <Card pad={false} className="rise-1">
          <div className="px-5 pt-4"><CardTitle right={<Badge tone="warm">{bekleyenler.length} bekliyor</Badge>}>bekleyen talepler</CardTitle></div>
          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className="text-left text-[10.5px] uppercase tracking-wider text-ink/40">
                  <th className="px-5 py-2">belediye</th><th className="px-3 py-2">havuz</th>
                  <th className="px-3 py-2 text-right">miktar</th><th className="px-3 py-2 text-right">tutar</th>
                  <th className="px-3 py-2">not</th>{canManage && <th className="px-3 py-2 text-right">karar</th>}
                </tr>
              </thead>
              <tbody>
                {bekleyenler.map((t) => (
                  <tr key={t.id} className="border-t border-leaf-200/30">
                    <td className="px-5 py-2.5 font-medium">{t.buyerOrg}</td>
                    <td className="px-3 py-2.5 text-ink/60">{t.pool.projectName}</td>
                    <td className="px-3 py-2.5 text-right">{fmt1(t.amountTCO2e)} tCO₂e</td>
                    <td className="px-3 py-2.5 text-right">{fmt1(t.amountTCO2e * t.priceTRYPerTon)} ₺</td>
                    <td className="px-3 py-2.5 text-ink/50">{t.requestNote ?? "—"}</td>
                    {canManage && <td className="px-3 py-2.5 text-right"><TalepKarar islem={t} /></td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <div className="grid gap-5 xl:grid-cols-2">
        <Card className="rise-1">
          <CardTitle>havuz doluluğu</CardTitle>
          {doluluk.length === 0 ? <EmptyState title="Aktif havuz yok" /> : (
            <Chart height={260} option={{
              tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
              legend: { bottom: 0 },
              grid: { left: 8, right: 16, top: 12, bottom: 34, containLabel: true },
              xAxis: { type: "value", axisLabel: { formatter: (v: number) => `${v} t` } },
              yAxis: { type: "category", data: doluluk.map((d) => d.name.length > 22 ? `${d.name.slice(0, 22)}…` : d.name) },
              series: [
                { name: "transfer edilen", type: "bar", stack: "t", data: doluluk.map((d) => Math.round(d.satilan * 10) / 10), itemStyle: { color: "#0c4a33" } },
                { name: "satışa açık", type: "bar", stack: "t", data: doluluk.map((d) => Math.round(d.kalan * 10) / 10), itemStyle: { color: "#4ade80" }, barMaxWidth: 26 },
              ],
            }} />
          )}
        </Card>
        <Card className="rise-2">
          <CardTitle>standart dağılımı</CardTitle>
          {standartDagilim.length === 0 ? <EmptyState title="Aktif havuz yok" /> : (
            <Chart height={260} option={{
              tooltip: { trigger: "item", formatter: "{b}: {c} tCO₂e ({d}%)" },
              legend: { bottom: 0 },
              series: [{
                type: "pie", radius: ["48%", "72%"], center: ["50%", "44%"],
                itemStyle: { borderRadius: 8, borderColor: "#fff", borderWidth: 2 },
                label: { show: false }, data: standartDagilim,
              }],
            }} />
          )}
        </Card>
      </div>

      <Card pad={false} className="rise-2">
        <div className="px-5 pt-4"><CardTitle>havuzlar</CardTitle></div>
        <div className="overflow-x-auto">
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="text-left text-[10.5px] uppercase tracking-wider text-ink/40">
                <th className="px-5 py-2">proje</th><th className="px-3 py-2">standart</th>
                <th className="px-3 py-2">vintage</th><th className="px-3 py-2 text-right">kapasite</th>
                <th className="px-3 py-2 text-right">kalan</th><th className="px-3 py-2 text-right">fiyat</th>
                <th className="px-3 py-2">durum</th>{canManage && <th className="px-3 py-2 text-right">işlem</th>}
              </tr>
            </thead>
            <tbody>
              {pools.map((p) => (
                <tr key={p.id} className={`border-t border-leaf-200/30 ${p.active ? "" : "opacity-45"}`}>
                  <td className="px-5 py-2.5 font-medium">{p.projectName}</td>
                  <td className="px-3 py-2.5"><Badge tone="gray">{CREDIT_STANDARD_LABELS[p.standard as CreditStandard] ?? p.standard}</Badge></td>
                  <td className="px-3 py-2.5 text-ink/60">{p.vintageYear}</td>
                  <td className="px-3 py-2.5 text-right">{fmt1(p.totalTCO2e)} t</td>
                  <td className="px-3 py-2.5 text-right font-medium">{fmt1(p.availableTCO2e)} t</td>
                  <td className="px-3 py-2.5 text-right">{fmt1(p.priceTRYPerTon)} ₺</td>
                  <td className="px-3 py-2.5"><Badge tone={p.active ? "leaf" : "gray"}>{p.active ? "vitrinde" : "pasif"}</Badge></td>
                  {canManage && (
                    <td className="px-3 py-2.5 text-right whitespace-nowrap">
                      <button type="button" onClick={() => setDuzenle(p)} className="cursor-pointer text-[11.5px] font-medium text-leaf-700 hover:underline">düzenle</button>
                      <button type="button" onClick={() => havuzPasif(p)} className={`ml-3 cursor-pointer text-[11.5px] font-medium hover:underline ${p.active ? "text-danger" : "text-leaf-700"}`}>
                        {p.active ? "vitrinden kaldır" : "vitrine al"}
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card pad={false} className="rise-3">
        <div className="px-5 pt-4"><CardTitle>işlem geçmişi</CardTitle></div>
        {gecmis.length === 0 ? <div className="px-5 pb-5"><EmptyState title="Henüz sonuçlanan işlem yok" /></div> : (
          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className="text-left text-[10.5px] uppercase tracking-wider text-ink/40">
                  <th className="px-5 py-2">tarih</th><th className="px-3 py-2">belediye</th>
                  <th className="px-3 py-2">havuz</th><th className="px-3 py-2 text-right">miktar</th>
                  <th className="px-3 py-2 text-right">tutar</th><th className="px-3 py-2">durum</th>
                </tr>
              </thead>
              <tbody>
                {gecmis.map((t) => (
                  <tr key={t.id} className="border-t border-leaf-200/30">
                    <td className="px-5 py-2.5 text-ink/50">{new Date(t.createdAt).toLocaleDateString("tr-TR")}</td>
                    <td className="px-3 py-2.5 font-medium">{t.buyerOrg}</td>
                    <td className="px-3 py-2.5 text-ink/60">{t.pool.projectName}</td>
                    <td className="px-3 py-2.5 text-right">{fmt1(t.amountTCO2e)} t</td>
                    <td className="px-3 py-2.5 text-right">{fmt1(t.amountTCO2e * t.priceTRYPerTon)} ₺</td>
                    <td className="px-3 py-2.5">
                      <Badge tone={statusTone(t.status)}>{CREDIT_STATUS_LABELS[t.status as CreditStatus] ?? t.status}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {duzenle && <HavuzModal initial={duzenle} onClose={() => setDuzenle(null)} />}
    </div>
  );
}
