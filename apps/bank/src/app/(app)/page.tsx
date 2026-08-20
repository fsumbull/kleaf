import { getScope } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fmtTons } from "@/lib/format";
import { PageHeader, KpiCard, Card, CardTitle, EmptyState } from "@/components/ui";
import Chart from "@/components/chart";
import BranchFootprintChart from "@/components/branch-footprint-chart";
import type { EChartsOption } from "echarts";
import type { CategoryCode } from "@/lib/constants";
import { yearScopeTotals, type EmissionRow } from "@/lib/carbon/engine";

const TIP_LABEL: Record<string, string> = {
  AGACLANDIRMA: "ağaçlandırma", YENILENEBILIR: "yenilenebilir enerji", ENERJI_VERIMLILIGI: "enerji verimliliği",
  METAN: "metan yakalama", BIYOKOMUR: "biyokömür", MAVI_KARBON: "mavi karbon", DAC: "doğrudan hava yakalama", TEMIZ_OCAK: "temiz ocak",
};
const STD_LABEL: Record<string, string> = { GOLD_STANDARD: "Gold Standard", VCS: "Verra VCS", ULUSAL: "ulusal program", CDM: "CDM", ACR: "ACR" };
const STAGE_LABEL: Record<string, string> = { FIZIBILITE: "fizibilite", VALIDASYON: "validasyon", DOGRULAMA: "doğrulama", IHRAC: "ihraç", AKTIF: "aktif" };

const mn = (v: number) => (v / 1_000_000).toLocaleString("tr-TR", { maximumFractionDigits: 1 });

export default async function BankaGenelBakis() {
  const { org } = await getScope();
  if (org.type !== "KARBON_BANK") {
    return (
      <Card className="rise-1">
        <EmptyState title="Bu KarbonBank uygulamasıdır" desc="Belediye paneli ayrı çalışır — KarbonKent için http://localhost:3100 adresine gidin." />
      </Card>
    );
  }

  const [pools, projects, txs, clients, orders, prices] = await Promise.all([
    prisma.creditPool.findMany({ where: { bankOrgId: org.id }, include: { project: { select: { projectType: true } } } }),
    prisma.creditProject.findMany({ where: { bankOrgId: org.id } }),
    prisma.creditTransaction.findMany({ where: { bankOrgId: org.id } }),
    prisma.clientAccount.findMany({ where: { bankOrgId: org.id } }),
    prisma.tradeOrder.findMany({ where: { bankOrgId: org.id, status: "ACIK" } }),
    prisma.priceCurve.findMany({ where: { bankOrgId: org.id }, orderBy: { date: "asc" } }),
  ]);

  // ── B2: Bankanın kendi operasyonel karbon ayak izi ──
  const [bankFacilities, bankRecords, bankRetirements] = await Promise.all([
    prisma.facility.findMany({
      where: { orgId: org.id },
      select: { id: true, name: true, type: true, staffCount: true, areaM2: true },
    }),
    prisma.emissionRecord.findMany({
      where: { activityData: { facility: { orgId: org.id } } },
      select: { scope: true, tCO2e: true, activityData: { select: { facilityId: true, year: true, month: true, category: true } } },
    }),
    prisma.creditRetirement.findMany({
      where: { orgId: org.id, transaction: { pool: { poolType: "BANKA_REZERV" } } },
      select: { year: true, amountTCO2e: true },
    }),
  ]);
  const bankEngineRows: EmissionRow[] = bankRecords.map((r) => ({
    year: r.activityData.year, month: r.activityData.month,
    category: r.activityData.category as CategoryCode,
    scope: r.scope as 1 | 2 | 3, tCO2e: r.tCO2e,
  }));
  const opYear = 2025;
  const opScope = yearScopeTotals(bankEngineRows, opYear);
  const opRetiredThisYear = bankRetirements.filter((r) => r.year === opYear).reduce((a, r) => a + r.amountTCO2e, 0);
  const opNet = Math.max(0, opScope.total - opRetiredThisYear);
  // portföy iklim etkisi = TRANSFER edilen krediler (müşteri portföyü — banka rezervi hariç)
  const portfoyEtki = txs.filter((t) => t.status === "TRANSFER" && t.buyerOrgId !== org.id)
    .reduce((a, t) => a + t.amountTCO2e, 0);
  // Şube başına tCO2e (yıl 2025)
  const facTotals = new Map<string, number>();
  for (const r of bankRecords) {
    if (r.activityData.year !== opYear) continue;
    const t = r.scope === 2 ? Math.max(0, r.tCO2e) : r.tCO2e;
    facTotals.set(r.activityData.facilityId, (facTotals.get(r.activityData.facilityId) ?? 0) + t);
  }
  const facRows = bankFacilities
    .map((f) => ({ name: f.name, tCO2e: facTotals.get(f.id) ?? 0, staff: f.staffCount ?? 0 }))
    .sort((a, b) => b.tCO2e - a.tCO2e);

  const toplamHacim = pools.reduce((a, p) => a + p.totalTCO2e, 0);
  const satisaAcik = pools.filter((p) => p.active).reduce((a, p) => a + p.availableTCO2e, 0);
  const mtm = pools.filter((p) => p.active).reduce((a, p) => a + p.availableTCO2e * p.priceTRYPerTon, 0);
  const transferEdilen = txs.filter((t) => t.status === "TRANSFER").reduce((a, t) => a + t.amountTCO2e, 0);
  const ciro = txs.filter((t) => t.status === "TRANSFER").reduce((a, t) => a + t.amountTCO2e * t.priceTRYPerTon, 0);
  const aktifProje = projects.filter((p) => p.stage === "AKTIF").length;
  const pipeline = projects.filter((p) => p.stage !== "AKTIF").length;
  const bekleyenTalep = txs.filter((t) => t.status === "TALEP").length;

  const tipMap = new Map<string, number>();
  for (const p of pools) { const t = p.projectType || p.project?.projectType || "DIGER"; tipMap.set(t, (tipMap.get(t) ?? 0) + p.availableTCO2e); }
  const tipData = [...tipMap.entries()].map(([k, v]) => ({ name: TIP_LABEL[k] ?? k, value: Math.round(v) }));

  const stdMap = new Map<string, number>();
  for (const p of pools) stdMap.set(p.standard, (stdMap.get(p.standard) ?? 0) + p.availableTCO2e);
  const stdData = [...stdMap.entries()].map(([k, v]) => ({ name: STD_LABEL[k] ?? k, value: Math.round(v) }));

  const standartlar = [...new Set(prices.map((p) => p.standard))];
  const tarihler = [...new Set(prices.map((p) => p.date.toISOString().slice(0, 7)))];

  const stageOrder = ["FIZIBILITE", "VALIDASYON", "DOGRULAMA", "IHRAC", "AKTIF"];
  const stageData = stageOrder.map((s) => projects.filter((p) => p.stage === s).length);

  const pieOption = (data: { name: string; value: number }[]): EChartsOption => ({
    tooltip: { trigger: "item" },
    legend: { bottom: 0, itemWidth: 10, itemHeight: 10 },
    series: [{ type: "pie", radius: ["45%", "72%"], center: ["50%", "44%"], itemStyle: { borderRadius: 6, borderColor: "#fff", borderWidth: 2 }, label: { show: false }, data }],
  });

  return (
    <>
      <PageHeader eyebrow="karbonbank" title="Portföy genel bakış" desc={`${org.name} · karbon kredisi varlık defteri · ${clients.length} müşteri · ${orders.length} açık emir`} />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rise-1"><KpiCard label="portföy hacmi" value={fmtTons(toplamHacim)} unit="tCO₂e" hint={`satışa açık: ${fmtTons(satisaAcik)}`} href="/banka" /></div>
        <div className="rise-2"><KpiCard label="portföy değeri (MtM)" value={mn(mtm)} unit="mn ₺" hint="satışa açık × güncel fiyat" href="/ticaret" /></div>
        <div className="rise-3"><KpiCard label="transfer edilen" value={fmtTons(transferEdilen)} unit="tCO₂e" hint={`ciro: ${mn(ciro)} mn ₺`} href="/musteriler" /></div>
        <div className="rise-4"><KpiCard label="aktif / pipeline proje" value={`${aktifProje} / ${pipeline}`} hint={`${bekleyenTalep} bekleyen talep`} href="/projeler" tone={bekleyenTalep > 0 ? "warm" : "leaf"} /></div>
      </div>

      <div className="mb-6 grid gap-4 xl:grid-cols-3">
        <Card className="rise-1"><CardTitle>proje tipi dağılımı</CardTitle><Chart option={pieOption(tipData)} height={260} /></Card>
        <Card className="rise-2"><CardTitle>standart dağılımı</CardTitle><Chart option={pieOption(stdData)} height={260} /></Card>
        <Card className="rise-3"><CardTitle>proje hattı (aşama)</CardTitle>
          <Chart height={260} option={{ tooltip: { trigger: "axis" }, grid: { left: 10, right: 12, top: 20, bottom: 24, containLabel: true }, xAxis: { type: "category", data: stageOrder.map((s) => STAGE_LABEL[s]) }, yAxis: { type: "value" }, series: [{ type: "bar", data: stageData, itemStyle: { color: "#16a34a", borderRadius: [6, 6, 0, 0] }, barWidth: "52%" }] }} />
        </Card>
      </div>

      <Card className="rise-2">
        <CardTitle right={<span className="text-[11.5px] text-ink/45">₺/tCO₂e · son 6 ay</span>}>fiyat eğrisi</CardTitle>
        <Chart height={280} option={{
          tooltip: { trigger: "axis" }, legend: { top: 0 },
          grid: { left: 10, right: 16, top: 34, bottom: 24, containLabel: true },
          xAxis: { type: "category", data: tarihler }, yAxis: { type: "value", scale: true },
          series: standartlar.map((std) => ({
            name: STD_LABEL[std] ?? std, type: "line" as const, smooth: true, symbol: "circle", symbolSize: 7,
            data: tarihler.map((t) => { const row = prices.find((p) => p.standard === std && p.date.toISOString().slice(0, 7) === t); return row ? Math.round(row.priceTRYPerTon) : null; }),
          })),
        }} />
      </Card>

      {/* ── Kurumsal ayak izi (B2) — bankanın kendi operasyonel karbon envanteri ── */}
      <div className="mt-8 mb-3 flex items-end justify-between">
        <div>
          <p className="eyebrow">kurumsal ayak izi</p>
          <h2 className="text-[19px] font-semibold text-ink">Bankanın kendi operasyonel emisyonu · {opYear}</h2>
        </div>
        <span className="text-[11.5px] text-ink/45">{bankFacilities.length} tesis · şube/GM/DC</span>
      </div>

      <div className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rise-1"><KpiCard label="Kapsam 1" value={fmtTons(opScope.s1)} unit="tCO₂e" hint="doğrudan yakıt + soğutucu" href="/tesisler" /></div>
        <div className="rise-2"><KpiCard label="Kapsam 2" value={fmtTons(opScope.s2)} unit="tCO₂e" hint="satın alınan elektrik" href="/tesisler" /></div>
        <div className="rise-3"><KpiCard label="Kapsam 3" value={fmtTons(opScope.s3)} unit="tCO₂e" hint="dolaylı (bu yıl 0)" href="/veri-girisi" /></div>
        <div className="rise-4">
          <KpiCard
            label="net operasyonel"
            value={fmtTons(opNet)} unit="tCO₂e"
            hint={`brüt ${fmtTons(opScope.total)} − rezerv mahsup ${fmtTons(opRetiredThisYear)}`}
            tone={opNet <= 0.5 ? "leaf" : opRetiredThisYear > 0 ? "leaf" : "warm"}
          />
        </div>
      </div>

      <div className="mb-6 grid gap-4 xl:grid-cols-[1.15fr_1fr]">
        <Card className="rise-1">
          <CardTitle right={<span className="text-[11px] text-ink/40">tCO₂e · {opYear}</span>}>şube başına ayak izi</CardTitle>
          <BranchFootprintChart rows={facRows.map((r) => ({ name: r.name, tCO2e: r.tCO2e }))} height={260} />
        </Card>

        <Card className="rise-2">
          <CardTitle right={<span className="text-[11px] text-ink/40">operasyon ↔ portföy</span>}>öz-mahsup ve portföy iklim etkisi</CardTitle>
          <div className="grid gap-3 p-2">
            <div className="rounded-2xl border border-leaf-200/60 bg-leaf-50/50 p-4">
              <p className="text-[11px] uppercase tracking-wide text-ink/50">portföy iklim etkisi (transfer edilen)</p>
              <p className="mt-1 font-brand text-[32px] font-bold text-leaf-700">{fmtTons(portfoyEtki)}<span className="ml-1 text-[13px] font-normal text-ink/50">tCO₂e</span></p>
              <p className="mt-1 text-[11.5px] text-ink/55">müşterilerin edinilip azaltıma yönlendirdiği hacim — bankanın portföyü aracılığıyla önlenmiş emisyon eşdeğeri</p>
            </div>
            <div className="rounded-2xl border border-leaf-200/60 bg-white/70 p-4">
              <p className="text-[11px] uppercase tracking-wide text-ink/50">öz-mahsup (banka rezerv havuzu → 2025)</p>
              <p className="mt-1 font-brand text-[26px] font-bold text-ink">{fmtTons(opRetiredThisYear)}<span className="ml-1 text-[12px] font-normal text-ink/50">tCO₂e</span></p>
              <p className="mt-1 text-[11.5px] text-ink/55">bankanın kendi operasyonel emisyonu için ayırdığı rezerv havuzdan retire ettiği miktar — portföyle karışmaz</p>
            </div>
            <div className="rounded-2xl border border-leaf-200/60 bg-white/40 p-3">
              <div className="flex items-center justify-between text-[12px]">
                <span className="text-ink/60">brüt operasyonel</span>
                <b>{fmtTons(opScope.total)} tCO₂e</b>
              </div>
              <div className="mt-1 flex items-center justify-between text-[12px]">
                <span className="text-ink/60">− rezerv mahsup</span>
                <b className="text-leaf-700">−{fmtTons(opRetiredThisYear)} tCO₂e</b>
              </div>
              <hr className="my-2 border-leaf-200/60" />
              <div className="flex items-center justify-between text-[13px]">
                <span className="font-medium text-ink">= net operasyonel</span>
                <b className={opNet <= 0.5 ? "text-leaf-700" : "text-warm"}>{fmtTons(opNet)} tCO₂e</b>
              </div>
            </div>
          </div>
        </Card>
      </div>
    </>
  );
}
