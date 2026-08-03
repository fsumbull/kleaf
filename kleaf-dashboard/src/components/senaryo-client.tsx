"use client";
/* Senaryo stüdyosu — kaydırıcılarla anlık patika simülasyonu (motor istemcide çalışır) */
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Chart from "@/components/chart";
import { Card, CardTitle, KpiCard, Table, btnPrimary, btnGhost, inputCls } from "@/components/ui";
import {
  scenarioAnnualSavings, scenarioAnnualSavingsTRY, scenarioPath, trendProjection, linearNetZeroPath,
  paybackYears, priorityScores, GES_CAPEX_TRY_PER_KWP,
  type ScenarioParams, type ScenarioContext,
} from "@/lib/carbon/engine";
import { fmtTons, fmtTRY, fmt1, fmtInt } from "@/lib/format";

export interface SavedScenario { id: string; name: string; params: ScenarioParams }

/* Kaldıraç başına kaba yatırım maliyeti (₺ / tCO₂e·yıl azaltım kapasitesi) — MACC yaklaşımı için sıralama varsayımları. */
const LEVER_CAPEX_PER_TCO2E: Record<string, number> = {
  ges: 0,          // GES capex'i kWp üzerinden ayrıca hesaplanır
  filo: 22_000,    // EV fiyat farkı amortismanı
  bina: 12_000,    // genel verimlilik paketi
  led: 7_000,      // armatür yenileme
  yalitim: 15_000, // dış cephe yalıtımı
  kazan: 9_000,    // kazan/ısı pompası dönüşümü
  kompost: 4_000,  // kompost tesisi payı
  ayristirma: 4_500,
  topluTasima: 5_000,
};
const LEVER_LABELS: Record<string, string> = {
  ges: "GES kurulumu", filo: "filo elektrifikasyonu", bina: "bina verimliliği", led: "LED dönüşümü",
  yalitim: "yalıtım programı", kazan: "verimli kazan/ısı pompası", kompost: "kompost saptırma",
  ayristirma: "geri dönüşüm ayrıştırma", topluTasima: "toplu taşıma/rota",
};

export function SenaryoClient({ orgId, baselineYear, netZeroYear, baselineTotal, yearTotals, ctx, saved, canSave, currentYear }: {
  orgId: string;
  baselineYear: number;
  netZeroYear: number;
  baselineTotal: number;
  yearTotals: [number, number][];
  ctx: ScenarioContext;
  saved: SavedScenario[];
  canSave: boolean;
  currentYear: number;
}) {
  const router = useRouter();
  const [params, setParams] = useState<ScenarioParams>(
    saved[0]?.params ?? { gesKwp: 1000, filoElektrifikasyonPct: 30, binaVerimlilikPct: 10 }
  );
  const [capex, setCapex] = useState<number | "">("");
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const { savings, savingsTRY, chartOption } = useMemo(() => {
    const totalsMap = new Map(yearTotals);
    const savings = scenarioAnnualSavings(params, ctx);
    const savingsTRY = scenarioAnnualSavingsTRY(params, ctx);
    const trend = trendProjection(totalsMap, netZeroYear);
    const scenario = scenarioPath(trend, currentYear + 1, savings.toplam);
    const target = linearNetZeroPath(baselineYear, baselineTotal, netZeroYear);

    const years: number[] = [];
    for (let y = baselineYear; y <= netZeroYear; y++) years.push(y);
    const pick = (m: Map<number, number>) => years.map((y) => (m.has(y) ? Number(m.get(y)!.toFixed(1)) : null));

    const chartOption = {
      grid: { left: 56, right: 18, top: 40, bottom: 30 },
      legend: { top: 0, left: 0, itemWidth: 14, itemHeight: 3 },
      tooltip: { trigger: "axis" as const, valueFormatter: (v: unknown) => (v == null ? "—" : `${fmtTons(Number(v))} tCO₂e`) },
      xAxis: { type: "category" as const, data: years.map(String), axisLabel: { interval: 4 } },
      yAxis: { type: "value" as const, name: "tCO₂e/yıl" },
      series: [
        {
          name: "mevcut gidişat", type: "line" as const, smooth: true, symbol: "none",
          lineStyle: { width: 2, type: "dashed" as const, color: "#d97706" },
          itemStyle: { color: "#d97706" }, data: pick(trend),
        },
        {
          name: "senaryo", type: "line" as const, smooth: true, symbol: "none",
          lineStyle: { width: 3, color: "#16a34a" }, itemStyle: { color: "#16a34a" },
          areaStyle: { color: { type: "linear" as const, x: 0, y: 0, x2: 0, y2: 1, colorStops: [
            { offset: 0, color: "rgba(34,197,94,0.22)" }, { offset: 1, color: "rgba(34,197,94,0)" },
          ]}},
          data: pick(scenario),
        },
        {
          name: `${netZeroYear} net-sıfır patikası`, type: "line" as const, symbol: "none",
          lineStyle: { width: 2, type: "dotted" as const, color: "#0c4a33" },
          itemStyle: { color: "#0c4a33" }, data: pick(target),
        },
      ],
    };
    return { savings, savingsTRY, chartOption };
  }, [params, ctx, yearTotals, baselineYear, baselineTotal, netZeroYear, currentYear]);

  const tahminiCapex = capex !== "" ? capex : params.gesKwp * GES_CAPEX_TRY_PER_KWP;
  const geriOdeme = paybackYears(tahminiCapex, savingsTRY.toplam);

  /* MACC yaklaşımı: kaldıraçları azaltım/CAPEX oranıyla önceliklendir (engine.priorityScores) */
  const macc = useMemo(() => {
    const levers = (["ges", "filo", "bina", "led", "yalitim", "kazan", "kompost", "ayristirma", "topluTasima"] as const)
      .map((k) => ({
        key: k,
        label: LEVER_LABELS[k],
        reductionTCO2e: savings[k],
        capexTRY: k === "ges"
          ? params.gesKwp * GES_CAPEX_TRY_PER_KWP
          : savings[k] * LEVER_CAPEX_PER_TCO2E[k],
      }))
      .filter((l) => l.reductionTCO2e > 0.05);
    const scores = priorityScores(levers);
    return levers
      .map((l, i) => ({ ...l, score: scores[i] }))
      .sort((a, b) => b.score - a.score);
  }, [savings, params.gesKwp]);

  const maccOption = useMemo(() => ({
    grid: { left: 8, right: 44, top: 8, bottom: 8, containLabel: true },
    tooltip: {
      trigger: "axis" as const,
      axisPointer: { type: "shadow" as const },
      formatter: (p: unknown) => {
        const item = (p as { dataIndex: number }[])[0];
        const l = [...macc].reverse()[item.dataIndex];
        return `<b>${l.label}</b><br/>öncelik skoru: <b>${fmtInt(l.score)}</b>/100<br/>azaltım: ${fmtTons(l.reductionTCO2e)} tCO₂e/yıl<br/>tahmini yatırım: ${fmtTRY(l.capexTRY)}`;
      },
    },
    xAxis: { type: "value" as const, max: 100, splitLine: { lineStyle: { color: "rgba(22,163,74,0.08)" } }, axisLabel: { fontSize: 11 } },
    yAxis: {
      type: "category" as const,
      data: [...macc].reverse().map((l) => l.label),
      axisLabel: { fontSize: 11.5 },
      axisTick: { show: false },
    },
    series: [{
      type: "bar" as const,
      barWidth: 14,
      itemStyle: { borderRadius: [0, 5, 5, 0] },
      label: { show: true, position: "right" as const, fontSize: 10.5, formatter: (d: { value?: unknown }) => String(Math.round(Number(d.value ?? 0))) },
      data: [...macc].reverse().map((l) => ({
        value: Number(l.score.toFixed(1)),
        itemStyle: { color: l.score >= 70 ? "#16a34a" : l.score >= 35 ? "#84cc16" : "#d97706" },
      })),
    }],
  }), [macc]);

  /* kayıtlı senaryoların karşılaştırma metrikleri — aynı bağlamda motorla hesaplanır */
  const comparison = useMemo(() => saved.map((s) => {
    const sv = scenarioAnnualSavings(s.params, ctx);
    const tr = scenarioAnnualSavingsTRY(s.params, ctx);
    const cx = (s.params as { capexTRY?: number }).capexTRY ?? s.params.gesKwp * GES_CAPEX_TRY_PER_KWP;
    return { id: s.id, name: s.name, params: s.params, azaltim: sv.toplam, tasarruf: tr.toplam, geriOdeme: paybackYears(cx, tr.toplam) };
  }), [saved, ctx]);

  async function onSave() {
    if (!name.trim()) { setError("Senaryoya bir ad verin"); return; }
    setSaving(true); setError(null);
    const res = await fetch("/api/senaryolar", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orgId, name: name.trim(), params }),
    });
    setSaving(false);
    if (!res.ok) { setError((await res.json().catch(() => null))?.error ?? "Kaydedilemedi"); return; }
    setName("");
    router.refresh();
  }

  async function onDelete(id: string) {
    await fetch("/api/senaryolar", {
      method: "DELETE", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    router.refresh();
  }

  async function onRename(id: string) {
    const next = renameValue.trim();
    if (next.length < 2) { setError("Ad en az 2 karakter"); return; }
    const res = await fetch("/api/senaryolar", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, name: next }),
    });
    if (!res.ok) { setError((await res.json().catch(() => null))?.error ?? "Yeniden adlandırılamadı"); return; }
    setRenamingId(null);
    setRenameValue("");
    setError(null);
    router.refresh();
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[340px_1fr]">
      {/* sol: kaydırıcılar */}
      <div className="space-y-4">
        <Card className="rise-1">
          <CardTitle>enerji kaldıraçları</CardTitle>
          <div className="space-y-5">
            <Slider
              label="GES kurulu gücü" value={params.gesKwp} min={0} max={10000} step={100}
              format={(v) => `${v.toLocaleString("tr-TR")} kWp`}
              onChange={(v) => setParams((p) => ({ ...p, gesKwp: v }))}
              hint={`≈ ${fmtTons(savings.ges)} tCO₂e/yıl mahsup`}
            />
            <Slider
              label="bina enerji verimliliği" value={params.binaVerimlilikPct} min={0} max={100} step={5}
              format={(v) => `%${v}`}
              onChange={(v) => setParams((p) => ({ ...p, binaVerimlilikPct: v }))}
              hint={`≈ ${fmtTons(savings.bina)} tCO₂e/yıl azaltım`}
            />
            <Slider
              label="LED aydınlatma dönüşümü" value={params.ledDonusumPct ?? 0} min={0} max={100} step={5}
              format={(v) => `%${v}`}
              onChange={(v) => setParams((p) => ({ ...p, ledDonusumPct: v }))}
              hint={`≈ ${fmtTons(savings.led)} tCO₂e/yıl azaltım`}
            />
            <Slider
              label="bina yalıtım programı" value={params.yalitimPct ?? 0} min={0} max={100} step={5}
              format={(v) => `%${v}`}
              onChange={(v) => setParams((p) => ({ ...p, yalitimPct: v }))}
              hint={`≈ ${fmtTons(savings.yalitim)} tCO₂e/yıl azaltım`}
            />
            <Slider
              label="verimli kazan / ısı pompası" value={params.kazanPct ?? 0} min={0} max={100} step={5}
              format={(v) => `%${v}`}
              onChange={(v) => setParams((p) => ({ ...p, kazanPct: v }))}
              hint={`≈ ${fmtTons(savings.kazan)} tCO₂e/yıl azaltım`}
            />
          </div>
        </Card>

        <Card className="rise-2">
          <CardTitle>ulaşım ve atık kaldıraçları</CardTitle>
          <div className="space-y-5">
            <Slider
              label="filo elektrifikasyonu" value={params.filoElektrifikasyonPct} min={0} max={100} step={5}
              format={(v) => `%${v}`}
              onChange={(v) => setParams((p) => ({ ...p, filoElektrifikasyonPct: v }))}
              hint={`≈ ${fmtTons(savings.filo)} tCO₂e/yıl azaltım`}
            />
            <Slider
              label="toplu taşıma / rota optimizasyonu" value={params.topluTasimaPct ?? 0} min={0} max={100} step={5}
              format={(v) => `%${v}`}
              onChange={(v) => setParams((p) => ({ ...p, topluTasimaPct: v }))}
              hint={`≈ ${fmtTons(savings.topluTasima)} tCO₂e/yıl azaltım`}
            />
            <Slider
              label="kompost saptırma" value={params.kompostSaptirmaPct ?? 0} min={0} max={100} step={5}
              format={(v) => `%${v}`}
              onChange={(v) => setParams((p) => ({ ...p, kompostSaptirmaPct: v }))}
              hint={`≈ ${fmtTons(savings.kompost)} tCO₂e/yıl azaltım`}
            />
            <Slider
              label="geri dönüşüm ayrıştırma artışı" value={params.ayristirmaArtisiPct ?? 0} min={0} max={100} step={5}
              format={(v) => `%${v}`}
              onChange={(v) => setParams((p) => ({ ...p, ayristirmaArtisiPct: v }))}
              hint={`≈ ${fmtTons(savings.ayristirma)} tCO₂e/yıl azaltım`}
            />
          </div>
        </Card>

        <div className="rise-2">
          <KpiCard label="toplam yıllık azaltım potansiyeli" value={fmtTons(savings.toplam)} unit="tCO₂e/yıl"
            hint="5 yıllık kademeli devreye alma varsayımıyla" />
        </div>

        <Card className="rise-3">
          <CardTitle>finansal etki</CardTitle>
          <ul className="space-y-1.5 text-[12.5px] text-ink/65">
            {savingsTRY.ges > 0 && <li className="flex justify-between"><span>GES üretimi</span><b className="text-leaf-700">{fmtTRY(savingsTRY.ges)}/yıl</b></li>}
            {savingsTRY.led > 0 && <li className="flex justify-between"><span>LED tasarrufu</span><b className="text-leaf-700">{fmtTRY(savingsTRY.led)}/yıl</b></li>}
            {savingsTRY.gaz > 0 && <li className="flex justify-between"><span>doğalgaz tasarrufu</span><b className="text-leaf-700">{fmtTRY(savingsTRY.gaz)}/yıl</b></li>}
            {savingsTRY.filo > 0 && <li className="flex justify-between"><span>yakıt tasarrufu</span><b className="text-leaf-700">{fmtTRY(savingsTRY.filo)}/yıl</b></li>}
            {savingsTRY.atik > 0 && <li className="flex justify-between"><span>bertaraf tasarrufu</span><b className="text-leaf-700">{fmtTRY(savingsTRY.atik)}/yıl</b></li>}
            <li className="flex justify-between border-t border-leaf-100 pt-1.5"><span className="font-semibold text-ink">toplam</span><b className="text-leaf-700">{fmtTRY(savingsTRY.toplam)}/yıl</b></li>
          </ul>
          <div className="mt-3 border-t border-leaf-100 pt-3">
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-ink/45">
              toplam yatırım (boşsa GES başına {fmtTRY(GES_CAPEX_TRY_PER_KWP)}/kWp)
            </label>
            <input type="number" min={0} value={capex} placeholder={fmtTRY(params.gesKwp * GES_CAPEX_TRY_PER_KWP)}
              onChange={(e) => setCapex(e.target.value === "" ? "" : Number(e.target.value))} className={inputCls} />
            <p className="mt-2 text-[12.5px] text-ink/65">
              geri ödeme süresi:{" "}
              <b className={geriOdeme != null && geriOdeme <= 8 ? "text-leaf-700" : "text-ink"}>
                {geriOdeme != null ? `${fmt1(geriOdeme)} yıl` : "—"}
              </b>
            </p>
          </div>
        </Card>

        {canSave && (
          <Card className="rise-3">
            <CardTitle>senaryoyu kaydet</CardTitle>
            <div className="flex gap-2">
              <input
                type="text" value={name} onChange={(e) => setName(e.target.value)}
                placeholder="örn. 2030 yol haritası" className={inputCls}
              />
              <button type="button" className={btnPrimary} onClick={onSave} disabled={saving}>
                {saving ? "…" : "kaydet"}
              </button>
            </div>
            {error && <p className="mt-2 text-[12px] text-danger">{error}</p>}
          </Card>
        )}

        {saved.length > 0 && (
          <Card className="rise-4">
            <CardTitle>kayıtlı senaryolar</CardTitle>
            <div className="space-y-1.5">
              {saved.map((s) => (
                <div key={s.id} className="flex items-center justify-between gap-2 rounded-xl px-2.5 py-2 transition hover:bg-leaf-50">
                  {renamingId === s.id ? (
                    <div className="flex min-w-0 flex-1 items-center gap-1.5">
                      <input
                        type="text" value={renameValue} autoFocus
                        onChange={(e) => setRenameValue(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") onRename(s.id); if (e.key === "Escape") { setRenamingId(null); setRenameValue(""); } }}
                        className={inputCls}
                      />
                      <button type="button" className={btnPrimary} onClick={() => onRename(s.id)}>tamam</button>
                      <button type="button" className={btnGhost} onClick={() => { setRenamingId(null); setRenameValue(""); }}>iptal</button>
                    </div>
                  ) : (
                    <>
                      <button type="button" className="min-w-0 cursor-pointer text-left"
                        onClick={() => setParams(s.params)}>
                        <span className="block truncate text-[13px] font-medium text-ink">{s.name}</span>
                        <span className="block text-[11px] text-ink/45">
                          {s.params.gesKwp.toLocaleString("tr-TR")} kWp · filo %{s.params.filoElektrifikasyonPct} · bina %{s.params.binaVerimlilikPct}
                          {s.params.ledDonusumPct ? ` · LED %${s.params.ledDonusumPct}` : ""}
                        </span>
                      </button>
                      <div className="flex shrink-0 gap-1">
                        <button type="button" className={btnGhost} onClick={() => setParams(s.params)}>yükle</button>
                        {canSave && (
                          <>
                            <button type="button" onClick={() => { setRenamingId(s.id); setRenameValue(s.name); setError(null); }}
                              className="cursor-pointer rounded-lg px-2 py-1 text-[11.5px] text-ink/55 transition hover:bg-leaf-100 hover:text-leaf-800">
                              adını değiştir
                            </button>
                            <button type="button" onClick={() => onDelete(s.id)}
                              className="cursor-pointer rounded-lg px-2 py-1 text-[11.5px] text-danger/60 transition hover:bg-red-50 hover:text-danger">
                              sil
                            </button>
                          </>
                        )}
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>

      {/* sağ: patika grafiği + MACC + karşılaştırma */}
      <div className="space-y-4">
        <Card className="rise-2">
          <CardTitle right={<span className="text-[11px] text-ink/40">{baselineYear} → {netZeroYear}</span>}>
            emisyon patikası simülasyonu
          </CardTitle>
          <Chart height={420} option={chartOption} />
          <p className="mt-3 text-[11.5px] leading-relaxed text-ink/45">
            <b>mevcut gidişat</b>: geçmiş yıl toplamlarından doğrusal eğilim · <b>senaryo</b>: seçilen müdahalelerin{" "}
            {currentYear + 1}&apos;den itibaren 5 yılda kademeli devreye alınması · <b>net-sıfır patikası</b>: baz yıldan{" "}
            {netZeroYear}&apos;e doğrusal azalım hedefi
          </p>
        </Card>

        <Card className="rise-3">
          <CardTitle right={<span className="text-[11px] text-ink/40">azaltım / yatırım oranı — 0-100</span>}>
            yatırım öncelik sıralaması (MACC yaklaşımı)
          </CardTitle>
          {macc.length === 0 ? (
            <p className="py-6 text-center text-[12.5px] text-ink/45">Kaydırıcıları açın — pozitif azaltımı olan kaldıraçlar burada sıralanır.</p>
          ) : (
            <>
              <Chart height={Math.max(160, macc.length * 38 + 30)} option={maccOption} />
              <p className="mt-2 text-[11px] leading-relaxed text-ink/40">
                Skor, kaldıracın yıllık azaltımının tahmini yatırıma oranını küme içinde normalize eder (engine.priorityScores).
                GES yatırımı kWp üzerinden, diğerleri kaba ₺/tCO₂e varsayımlarıyla hesaplanır.
              </p>
            </>
          )}
        </Card>

        {comparison.length > 0 && (
          <Card className="rise-4" pad={false}>
            <div className="px-5 pt-5">
              <CardTitle right={<span className="text-[11px] text-ink/40">aynı referans yıl bağlamıyla</span>}>senaryo karşılaştırma</CardTitle>
            </div>
            <Table dense head={<>
              <th>senaryo</th><th className="text-right">GES</th><th className="text-right">azaltım</th>
              <th className="text-right">₺ tasarruf</th><th className="text-right">geri ödeme</th><th className="text-right"></th>
            </>}>
              {comparison.map((c) => (
                <tr key={c.id}>
                  <td className="max-w-[180px] truncate font-medium">{c.name}</td>
                  <td className="whitespace-nowrap text-right tabular-nums">{c.params.gesKwp.toLocaleString("tr-TR")} kWp</td>
                  <td className="whitespace-nowrap text-right tabular-nums text-leaf-700">{fmtTons(c.azaltim)} tCO₂e/yıl</td>
                  <td className="whitespace-nowrap text-right tabular-nums">{fmtTRY(c.tasarruf)}/yıl</td>
                  <td className="whitespace-nowrap text-right tabular-nums">{c.geriOdeme != null ? `${fmt1(c.geriOdeme)} yıl` : "—"}</td>
                  <td className="text-right">
                    <button type="button" className={btnGhost} onClick={() => setParams(c.params)}>yükle</button>
                  </td>
                </tr>
              ))}
            </Table>
          </Card>
        )}
      </div>
    </div>
  );
}

function Slider({ label, value, min, max, step, format, onChange, hint }: {
  label: string; value: number; min: number; max: number; step: number;
  format: (v: number) => string; onChange: (v: number) => void; hint?: string;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between">
        <span className="text-[12px] lowercase tracking-[0.08em] text-ink/60">{label}</span>
        <span className="text-[13px] font-bold text-leaf-700">{format(value)}</span>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-leaf-600"
        aria-label={label}
      />
      {hint && <p className="mt-1 text-[11px] text-ink/45">{hint}</p>}
    </div>
  );
}
