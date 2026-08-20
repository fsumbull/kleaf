"use client";
/* Ayarlar istemcisi — kurum parametreleri ve yıl hedefleri */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardTitle, Field, inputCls, btnPrimary, btnGhost, Table } from "@/components/ui";
import { fmtTons } from "@/lib/format";

export function KurumAyarFormu({ orgId, baselineYear, netZeroYear, prices, portalAcik: portalInit }: {
  orgId: string; baselineYear: number; netZeroYear: number; portalAcik: boolean;
  prices: {
    elektrikTRYPerKwh: number; dogalgazTRYPerM3: number; dizelTRYPerL: number;
    atikBertarafTRYPerTon: number; enerjiTasarrufHedefiPct: number;
    gesKwhPerKwp: number; gesCapexTRYPerKwp: number;
  };
}) {
  const router = useRouter();
  const [baz, setBaz] = useState(baselineYear);
  const [hedefYil, setHedefYil] = useState(netZeroYear);
  const [elektrik, setElektrik] = useState(prices.elektrikTRYPerKwh);
  const [dogalgaz, setDogalgaz] = useState(prices.dogalgazTRYPerM3);
  const [dizel, setDizel] = useState(prices.dizelTRYPerL);
  const [bertaraf, setBertaraf] = useState(prices.atikBertarafTRYPerTon);
  const [tasarrufHedefi, setTasarrufHedefi] = useState(prices.enerjiTasarrufHedefiPct);
  const [gesVerim, setGesVerim] = useState(prices.gesKwhPerKwp);
  const [gesCapex, setGesCapex] = useState(prices.gesCapexTRYPerKwp);
  const [portalAcik, setPortalAcik] = useState(portalInit);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSave() {
    setBusy(true); setMsg(null);
    const res = await fetch("/api/kurum-ayar", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        orgId, baselineYear: baz, netZeroYear: hedefYil,
        elektrikTRYPerKwh: elektrik, dogalgazTRYPerM3: dogalgaz, dizelTRYPerL: dizel,
        atikBertarafTRYPerTon: bertaraf, enerjiTasarrufHedefiPct: tasarrufHedefi,
        gesKwhPerKwp: gesVerim, gesCapexTRYPerKwp: gesCapex,
        portalAcik,
      }),
    });
    setBusy(false);
    if (res.ok) { setMsg({ ok: true, text: "Kaydedildi" }); router.refresh(); }
    else setMsg({ ok: false, text: (await res.json().catch(() => null))?.error ?? "Kaydedilemedi" });
  }

  return (
    <Card className="rise-1">
      <CardTitle>kurum parametreleri</CardTitle>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="baz yıl (envanter referansı)">
          <input type="number" value={baz} onChange={(e) => setBaz(Number(e.target.value))} className={inputCls} />
        </Field>
        <Field label="net-sıfır hedef yılı">
          <input type="number" value={hedefYil} onChange={(e) => setHedefYil(Number(e.target.value))} className={inputCls} />
        </Field>
      </div>
      <p className="mb-2 mt-4 text-[11px] font-semibold uppercase tracking-wide text-ink/40">birim fiyatlar (finansal analizler)</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="elektrik (₺/kWh)">
          <input type="number" step="any" value={elektrik} onChange={(e) => setElektrik(Number(e.target.value))} className={inputCls} />
        </Field>
        <Field label="doğalgaz (₺/m³)">
          <input type="number" step="any" value={dogalgaz} onChange={(e) => setDogalgaz(Number(e.target.value))} className={inputCls} />
        </Field>
        <Field label="dizel (₺/L)">
          <input type="number" step="any" value={dizel} onChange={(e) => setDizel(Number(e.target.value))} className={inputCls} />
        </Field>
        <Field label="atık bertaraf (₺/ton)">
          <input type="number" step="any" value={bertaraf} onChange={(e) => setBertaraf(Number(e.target.value))} className={inputCls} />
        </Field>
      </div>
      <div className="mt-3">
        <Field label="enerji tasarruf hedefi (%, baz yıla göre — binalar sayfası)">
          <input type="number" step="any" min={0} max={100} value={tasarrufHedefi} onChange={(e) => setTasarrufHedefi(Number(e.target.value))} className={inputCls} />
        </Field>
      </div>
      <p className="mb-2 mt-4 text-[11px] font-semibold uppercase tracking-wide text-ink/40">GES parametreleri (fizibilite ve senaryolar)</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="özgül üretim (kWh/kWp·yıl)">
          <input type="number" step="any" min={500} max={2500} value={gesVerim} onChange={(e) => setGesVerim(Number(e.target.value))} className={inputCls} />
        </Field>
        <Field label="kurulum maliyeti (₺/kWp)">
          <input type="number" step="any" min={0} value={gesCapex} onChange={(e) => setGesCapex(Number(e.target.value))} className={inputCls} />
        </Field>
      </div>
      <p className="mb-2 mt-4 text-[11px] font-semibold uppercase tracking-wide text-ink/40">kamuya açık portal</p>
      <label className="flex cursor-pointer items-center gap-2.5 text-[13px]">
        <input type="checkbox" checked={portalAcik} onChange={(e) => setPortalAcik(e.target.checked)} className="size-4 cursor-pointer accent-leaf-600" />
        <span>Envanter özetini <b>/portal</b> adresinde kamuya aç (oturum gerektirmez)</span>
      </label>
      <div className="mt-4 flex items-center gap-3">
        <button type="button" className={btnPrimary} onClick={onSave} disabled={busy}>
          {busy ? "kaydediliyor…" : "kaydet"}
        </button>
        {msg && <span className={`text-[12.5px] ${msg.ok ? "text-leaf-700" : "text-danger"}`}>{msg.text}</span>}
      </div>
    </Card>
  );
}

export function HedefTablosu({ orgId, targets, years }: {
  orgId: string;
  targets: { year: number; targetTCO2e: number }[];
  years: number[];
}) {
  const router = useRouter();
  const [editYear, setEditYear] = useState<number | null>(null);
  const [value, setValue] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const map = new Map(targets.map((t) => [t.year, t.targetTCO2e]));

  async function save(year: number, target: number | null) {
    setBusy(true);
    await fetch("/api/hedefler", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orgId, year, targetTCO2e: target }),
    });
    setBusy(false);
    setEditYear(null);
    router.refresh();
  }

  return (
    <Card className="rise-2" pad={false}>
      <div className="p-5 pb-0">
        <CardTitle right={<span className="text-[11px] text-ink/40">genel bakıştaki “hedef sapması” bu değerlerle hesaplanır</span>}>
          yıllık emisyon hedefleri
        </CardTitle>
      </div>
      <div className="p-4 pt-0">
        <Table dense head={<><th>yıl</th><th className="text-right">hedef (tCO₂e)</th><th className="w-40 text-right"></th></>}>
          {years.map((y) => {
            const t = map.get(y);
            const editing = editYear === y;
            return (
              <tr key={y}>
                <td className="font-medium">{y}</td>
                <td className="text-right tabular-nums">
                  {editing ? (
                    <input
                      type="number" step="any" autoFocus value={value}
                      onChange={(e) => setValue(e.target.value)}
                      className="w-36 rounded-lg border border-leaf-300 bg-white px-2.5 py-1 text-right text-[12.5px] outline-none focus:ring-2 focus:ring-leaf-200"
                    />
                  ) : t !== undefined ? fmtTons(t) : <span className="text-ink/30">tanımsız</span>}
                </td>
                <td className="text-right">
                  {editing ? (
                    <span className="inline-flex gap-1">
                      <button type="button" disabled={busy} className={btnPrimary}
                        onClick={() => { const n = Number(value.replace(",", ".")); if (Number.isFinite(n) && n >= 0) save(y, n); }}>
                        kaydet
                      </button>
                      <button type="button" className={btnGhost} onClick={() => setEditYear(null)}>vazgeç</button>
                    </span>
                  ) : (
                    <span className="inline-flex gap-1">
                      <button type="button" className={btnGhost}
                        onClick={() => { setEditYear(y); setValue(t !== undefined ? String(t) : ""); }}>
                        {t !== undefined ? "düzenle" : "hedef koy"}
                      </button>
                      {t !== undefined && (
                        <button type="button" disabled={busy} onClick={() => save(y, null)}
                          className="cursor-pointer rounded-lg px-2 py-1 text-[11.5px] text-danger/60 transition hover:bg-red-50 hover:text-danger">
                          kaldır
                        </button>
                      )}
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </Table>
      </div>
    </Card>
  );
}
