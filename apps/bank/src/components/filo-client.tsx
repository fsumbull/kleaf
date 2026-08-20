"use client";
/* Filo istemcisi — araç envanteri CRUD, yakıt dağılımı, anomali rozetleri, EV dönüşüm önerisi */
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import Chart from "@/components/chart";
import { Card, CardTitle, KpiCard, Badge, EmptyState, Field, inputCls, btnPrimary, btnGhost, Table } from "@/components/ui";
import {
  VEHICLE_TYPES, VEHICLE_TYPE_LABELS, FUEL_TYPES, FUEL_TYPE_LABELS,
  type VehicleType, type FuelType,
} from "@/lib/constants";
import { fmtTons, fmt1, fmtInt } from "@/lib/format";

export interface FleetVehicle {
  id: string;
  plateNo: string;
  name: string | null;
  vehicleType: string;
  fuelType: string;
  modelYear: number | null;
  active: boolean;
  facilityId: string | null;
  facilityName: string | null;
  yearTCO2e: number;
  priority: number;
  evSavingTCO2e: number;
  anomalies: { period: string; category: string; deviationPct: number; severity: "orta" | "yuksek" }[];
}

const formSchema = z.object({
  plateNo: z.string().min(2, "Plaka girin").max(20),
  name: z.string().max(120).optional(),
  vehicleType: z.enum(VEHICLE_TYPES),
  fuelType: z.enum(FUEL_TYPES),
  modelYear: z.number({ message: "Geçerli yıl girin" }).int().min(1980).max(2035).optional(),
  facilityId: z.string().optional(),
});
type FormValues = z.infer<typeof formSchema>;

export function FiloClient({ orgId, year, vehicles, fuelTotals, poolTCO2e, monthly, facilities, canEdit, canDelete }: {
  orgId: string;
  year: number;
  vehicles: FleetVehicle[];
  fuelTotals: { fuel: string; tCO2e: number }[];
  poolTCO2e: number;
  monthly: { month: string; tCO2e: number }[];
  facilities: { id: string; name: string }[];
  canEdit: boolean;
  canDelete: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [modal, setModal] = useState<null | { mode: "yeni" } | { mode: "duzenle"; v: FleetVehicle }>(null);
  const [error, setError] = useState<string | null>(null);
  const refresh = () => start(() => router.refresh());

  const totalFleet = vehicles.reduce((a, v) => a + v.yearTCO2e, 0) + poolTCO2e;
  const activeCount = vehicles.filter((v) => v.active).length;
  const evCount = vehicles.filter((v) => v.fuelType === "ELEKTRIK").length;
  const anomalyCount = vehicles.reduce((a, v) => a + v.anomalies.length, 0);
  const evPotential = vehicles.filter((v) => v.active).reduce((a, v) => a + v.evSavingTCO2e, 0);

  const ranked = useMemo(
    () => [...vehicles].filter((v) => v.priority > 0).sort((a, b) => b.priority - a.priority).slice(0, 8),
    [vehicles]
  );
  const maxPriority = Math.max(1, ...ranked.map((v) => v.priority));

  async function onToggleActive(v: FleetVehicle) {
    setError(null);
    const res = await fetch("/api/araclar", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: v.id, active: !v.active }),
    });
    if (!res.ok) setError((await res.json().catch(() => null))?.error ?? "İşlem başarısız");
    else refresh();
  }

  async function onDelete(v: FleetVehicle) {
    if (!confirm(`${v.plateNo} filodan silinsin mi?`)) return;
    setError(null);
    const res = await fetch("/api/araclar", {
      method: "DELETE", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: v.id }),
    });
    if (!res.ok) setError((await res.json().catch(() => null))?.error ?? "Silinemedi");
    else refresh();
  }

  return (
    <div className={pending ? "opacity-60 transition" : "transition"}>
      {/* KPI şeridi */}
      <div className="rise grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="filo emisyonu" value={fmtTons(totalFleet)} unit="tCO₂e" hint={`${year} · araç + havuz kayıtları`} />
        <KpiCard label="aktif araç" value={String(activeCount)} unit={`/ ${vehicles.length}`} hint={`${evCount} elektrikli`} />
        <KpiCard label="EV dönüşüm potansiyeli" value={fmtTons(evPotential)} unit="tCO₂e/yıl" hint="tüm fosil araçlar dönüşürse (net %70)" />
        <KpiCard label="tüketim anomalisi" value={String(anomalyCount)} unit="uyarı" tone={anomalyCount > 0 ? "warm" : "leaf"} hint="son 12 ayda medyan+MAD sapması" />
      </div>

      {error && (
        <p className="rise mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-[12.5px] text-danger">
          {error} <button className="ml-2 cursor-pointer underline" onClick={() => setError(null)}>kapat</button>
        </p>
      )}

      {/* grafikler */}
      <div className="mt-4 grid gap-4 lg:grid-cols-5">
        <Card className="rise-1 lg:col-span-3">
          <CardTitle right={<span className="text-[11px] text-ink/40">tCO₂e / ay · {year}</span>}>aylık filo emisyonu</CardTitle>
          <Chart height={240} option={{
            grid: { left: 44, right: 12, top: 24, bottom: 28 },
            tooltip: { trigger: "axis", valueFormatter: (v) => `${fmt1(Number(v))} t` },
            xAxis: { type: "category", data: monthly.map((m) => m.month.slice(0, 3)) },
            yAxis: { type: "value" },
            series: [{
              type: "bar", data: monthly.map((m) => +m.tCO2e.toFixed(2)),
              itemStyle: { borderRadius: [6, 6, 0, 0], color: "#16a34a" }, barWidth: "55%",
            }],
          }} />
        </Card>
        <Card className="rise-2 lg:col-span-2">
          <CardTitle right={<span className="text-[11px] text-ink/40">araç bazlı kayıtlar</span>}>yakıt türü dağılımı</CardTitle>
          {fuelTotals.length === 0 && poolTCO2e <= 0 ? (
            <EmptyState title="Henüz filo verisi yok" desc="Araç bağlantılı yakıt kaydı girildiğinde dağılım burada görünür." />
          ) : (
            <Chart height={240} option={{
              tooltip: { trigger: "item", valueFormatter: (v) => `${fmt1(Number(v))} tCO₂e` },
              legend: { bottom: 0, icon: "circle" },
              series: [{
                type: "pie", radius: ["48%", "72%"], center: ["50%", "44%"],
                itemStyle: { borderRadius: 6, borderColor: "#fff", borderWidth: 2 },
                label: { show: false },
                data: [
                  ...fuelTotals.map((f) => ({ name: FUEL_TYPE_LABELS[f.fuel as FuelType] ?? f.fuel, value: +f.tCO2e.toFixed(2) })),
                  ...(poolTCO2e > 0 ? [{ name: "havuz (araçsız)", value: +poolTCO2e.toFixed(2), itemStyle: { color: "#d1d5db" } }] : []),
                ],
              }],
            }} />
          )}
        </Card>
      </div>

      {/* dönüşüm önceliği */}
      {ranked.length > 0 && (
        <Card className="rise-2 mt-4">
          <CardTitle right={<span className="text-[11px] text-ink/40">emisyon × yakıt katsayısı (dizel 1.0 → CNG 0.7)</span>}>
            EV dönüşüm öncelik sırası
          </CardTitle>
          <ul className="mt-1 space-y-2.5">
            {ranked.map((v, i) => (
              <li key={v.id} className="flex items-center gap-3">
                <span className="w-5 text-right text-[12px] font-bold text-ink/35">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="truncate text-[13px] font-medium text-ink">
                      {v.plateNo} <span className="font-normal text-ink/45">{v.name ?? VEHICLE_TYPE_LABELS[v.vehicleType as VehicleType]}</span>
                    </p>
                    <p className="shrink-0 text-[12px] tabular-nums text-ink/55">
                      {fmtTons(v.yearTCO2e)} t · EV ile −{fmtTons(v.evSavingTCO2e)} t/yıl
                    </p>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-leaf-100">
                    <div className="h-full rounded-full bg-gradient-to-r from-warm to-leaf-500" style={{ width: `${(v.priority / maxPriority) * 100}%` }} />
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* araç envanteri */}
      <Card className="rise-3 mt-4" pad={false}>
        <div className="flex items-center justify-between px-5 pt-4">
          <h2 className="text-[14px] font-bold tracking-tight text-ink">araç envanteri</h2>
          {canEdit && (
            <button type="button" className={btnPrimary} onClick={() => setModal({ mode: "yeni" })}>+ araç ekle</button>
          )}
        </div>
        {vehicles.length === 0 ? (
          <EmptyState title="Kayıtlı araç yok" desc="Filo takibi için araç ekleyin; yakıt kayıtlarını araca bağlayın." />
        ) : (
          <div className="p-2">
            <Table dense head={<>
              <th>plaka</th><th>araç</th><th>tür</th><th>yakıt</th><th>model</th>
              <th className="text-right">{year} tCO₂e</th><th>anomali</th><th>durum</th><th></th>
            </>}>
              {vehicles.map((v) => (
                <tr key={v.id} className={v.active ? "" : "opacity-50"}>
                  <td className="whitespace-nowrap font-medium">{v.plateNo}</td>
                  <td className="max-w-[180px] truncate">{v.name ?? "—"}</td>
                  <td>{VEHICLE_TYPE_LABELS[v.vehicleType as VehicleType] ?? v.vehicleType}</td>
                  <td>
                    <Badge tone={v.fuelType === "ELEKTRIK" ? "leaf" : v.fuelType === "DIZEL" ? "warm" : "gray"}>
                      {FUEL_TYPE_LABELS[v.fuelType as FuelType] ?? v.fuelType}
                    </Badge>
                  </td>
                  <td className="text-ink/55">{v.modelYear ?? "—"}</td>
                  <td className="whitespace-nowrap text-right tabular-nums">{fmtTons(v.yearTCO2e)}</td>
                  <td>
                    {v.anomalies.length === 0 ? <span className="text-ink/30">—</span> : (
                      <span title={v.anomalies.map((a) => `${a.period}: ${a.deviationPct > 0 ? "+" : ""}${fmtInt(a.deviationPct)}%`).join("\n")}>
                        <Badge tone={v.anomalies.some((a) => a.severity === "yuksek") ? "danger" : "warm"}>
                          {v.anomalies.length} uyarı
                        </Badge>
                      </span>
                    )}
                  </td>
                  <td>
                    <Badge tone={v.active ? "leaf" : "gray"}>{v.active ? "aktif" : "pasif"}</Badge>
                  </td>
                  <td className="whitespace-nowrap text-right">
                    {canEdit && (
                      <>
                        <RowBtn onClick={() => setModal({ mode: "duzenle", v })}>düzenle</RowBtn>
                        <RowBtn onClick={() => onToggleActive(v)}>{v.active ? "pasife al" : "aktifle"}</RowBtn>
                      </>
                    )}
                    {canDelete && <RowBtn danger onClick={() => onDelete(v)}>sil</RowBtn>}
                  </td>
                </tr>
              ))}
            </Table>
          </div>
        )}
      </Card>

      {modal && (
        <VehicleModal
          orgId={orgId}
          facilities={facilities}
          initial={modal.mode === "duzenle" ? modal.v : undefined}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); refresh(); }}
          setError={setError}
        />
      )}
    </div>
  );
}

function RowBtn({ children, onClick, danger }: { children: React.ReactNode; onClick: () => void; danger?: boolean }) {
  return (
    <button type="button" onClick={onClick}
      className={`ml-1 cursor-pointer rounded-lg px-2 py-1 text-[11.5px] font-medium transition ${
        danger ? "text-danger/70 hover:bg-red-50 hover:text-danger" : "text-leaf-700/80 hover:bg-leaf-100 hover:text-leaf-800"
      }`}>
      {children}
    </button>
  );
}

function VehicleModal({ orgId, facilities, initial, onClose, onSaved, setError }: {
  orgId: string;
  facilities: { id: string; name: string }[];
  initial?: FleetVehicle;
  onClose: () => void;
  onSaved: () => void;
  setError: (e: string | null) => void;
}) {
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: initial
      ? {
          plateNo: initial.plateNo, name: initial.name ?? "",
          vehicleType: initial.vehicleType as VehicleType, fuelType: initial.fuelType as FuelType,
          modelYear: initial.modelYear ?? undefined, facilityId: initial.facilityId ?? "",
        }
      : { plateNo: "", name: "", vehicleType: "BINEK", fuelType: "DIZEL", modelYear: undefined, facilityId: facilities[0]?.id ?? "" },
  });

  async function onSubmit(v: FormValues) {
    const body = {
      ...(initial ? { id: initial.id } : { orgId }),
      plateNo: v.plateNo, name: v.name || null,
      vehicleType: v.vehicleType, fuelType: v.fuelType,
      modelYear: Number.isFinite(v.modelYear) ? v.modelYear : null,
      facilityId: v.facilityId || null,
    };
    const res = await fetch("/api/araclar", {
      method: initial ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      setError((await res.json().catch(() => null))?.error ?? "Kaydedilemedi");
      onClose();
      return;
    }
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/25 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="glass-strong w-full max-w-[440px] p-6" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-[16px] font-bold tracking-tight text-ink">{initial ? "Aracı düzenle" : "Yeni araç"}</h3>
          <button onClick={onClose} aria-label="kapat"
            className="cursor-pointer rounded-full p-1.5 text-ink/40 transition hover:bg-leaf-100 hover:text-ink">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3.5">
          <div className="grid grid-cols-2 gap-3">
            <Field label="plaka" error={errors.plateNo?.message}>
              <input {...register("plateNo")} className={inputCls} placeholder="06 ABC 123" />
            </Field>
            <Field label="model yılı" error={errors.modelYear?.message}>
              <input type="number" {...register("modelYear", { setValueAs: (v) => (v === "" || v === null ? undefined : Number(v)) })} className={inputCls} placeholder="2020" />
            </Field>
          </div>
          <Field label="araç adı (isteğe bağlı)">
            <input {...register("name")} className={inputCls} placeholder="Çöp kamyonu #1" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="araç türü" error={errors.vehicleType?.message}>
              <select {...register("vehicleType")} className={inputCls}>
                {VEHICLE_TYPES.map((t) => <option key={t} value={t}>{VEHICLE_TYPE_LABELS[t]}</option>)}
              </select>
            </Field>
            <Field label="yakıt türü" error={errors.fuelType?.message}>
              <select {...register("fuelType")} className={inputCls}>
                {FUEL_TYPES.map((t) => <option key={t} value={t}>{FUEL_TYPE_LABELS[t]}</option>)}
              </select>
            </Field>
          </div>
          <Field label="bağlı filo tesisi">
            <select {...register("facilityId")} className={inputCls}>
              <option value="">— bağımsız —</option>
              {facilities.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          </Field>
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" className={btnGhost} onClick={onClose}>vazgeç</button>
            <button type="submit" className={btnPrimary} disabled={isSubmitting}>
              {isSubmitting ? "kaydediliyor…" : "kaydet"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
