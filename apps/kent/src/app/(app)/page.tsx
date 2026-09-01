import Link from "next/link";
import { redirect } from "next/navigation";
import { getScope } from "@/lib/auth";
import { getEmissionRows, getMissingData, getLatestPeriod, getPendingCount, categoryLabel } from "@/lib/data";
import {
  yearScopeTotals, monthlyScopeTotals, totalsByCategory, totalsByFacility,
  yoyChangePct, intensity, targetGapPct, scopeOf, yilSonuTahmini, type AylikNokta,
} from "@/lib/carbon/engine";
import { prisma } from "@/lib/prisma";
import { fmtTons, fmt1 } from "@/lib/format";
import { PageHeader, KpiCard, Card, EmptyState } from "@/components/ui";
import { MonthlyTrendChart, ScopeDonut, SourceSankey, TopFacilitiesChart } from "@/components/overview-charts";
import { MONTHS_TR } from "@/lib/constants";

export default async function GenelBakis() {
  const { org, year, birim } = await getScope();
  if (org.type === "KARBON_BANK") redirect("/banka"); // banka kurumunun ana ekranı portföydür

  const bu = birim.unitId;
  const [rows, pending, latest, target, staffAgg] = await Promise.all([
    getEmissionRows(org.id, bu),
    getPendingCount(org.id, bu),
    getLatestPeriod(org.id, bu),
    bu ? Promise.resolve(null) : prisma.target.findUnique({ where: { orgId_year: { orgId: org.id, year } } }),
    prisma.facility.aggregate({ where: { orgId: org.id, ...(bu ? { unitId: bu } : {}) }, _sum: { staffCount: true } }),
  ]);

  const totals = yearScopeTotals(rows, year);
  const yoy = yoyChangePct(rows, year);
  const staff = staffAgg._sum.staffCount ?? 0;
  const perCapita = intensity(totals.total, staff);
  const gap = target ? targetGapPct(totals.total, target.targetTCO2e) : null;

  // aylık seri (yılın 12 ayı, verisiz aylar 0)
  const monthly = monthlyScopeTotals(rows.filter((r) => r.year === year));
  const monthlyData = Array.from({ length: 12 }, (_, i) => {
    const t = monthly.get(`${year}-${String(i + 1).padStart(2, "0")}`);
    return { month: i + 1, s1: t?.s1 ?? 0, s2: t?.s2 ?? 0, s3: t?.s3 ?? 0 };
  });

  // sankey + tesisler
  const byCat = totalsByCategory(rows.filter((r) => r.year === year));
  const sankeyRows = [...byCat.entries()].map(([category, tCO2e]) => ({
    category, label: categoryLabel(category), scope: scopeOf(category), tCO2e,
  }));
  const facilities = await prisma.facility.findMany({ where: { orgId: org.id, ...(bu ? { unitId: bu } : {}) }, select: { id: true, name: true } });
  const facTotals = totalsByFacility(rows.filter((r) => r.year === year));
  const topFacilities = [...facTotals.entries()]
    .map(([fid, t]) => ({ name: facilities.find((f) => f.id === fid)?.name ?? "—", tCO2e: t }))
    .sort((a, b) => b.tCO2e - a.tCO2e)
    .slice(0, 5);

  // eksik veri (girilen son dönem için)
  const missing = latest ? await getMissingData(org.id, latest.year, latest.month, bu) : [];

  // yıl sonu tahmini — tüm yılların aylık serisinden mevsimsel projeksiyon
  const tumAylikSeri: AylikNokta[] = [...monthlyScopeTotals(rows).entries()].map(([k, t]) => {
    const [yy, mm] = k.split("-").map(Number);
    return { year: yy, month: mm, tCO2e: t.total };
  });
  const tahmin = yilSonuTahmini(tumAylikSeri, year);

  const hasData = totals.total > 0;

  return (
    <>
      <PageHeader
        eyebrow="genel bakış"
        title={`${year} sera gazı envanteri`}
        desc={`${org.name} · baz yıl ${org.baselineYear} · hedef: ${org.netZeroYear} net sıfır`}
      />

      {(pending > 0 || missing.length > 0) && (
        <div className="rise mb-6 flex flex-wrap gap-3">
          {pending > 0 && (
            <Link href="/veri-girisi?durum=TASLAK"
              className="flex items-center gap-2.5 rounded-2xl border border-amber-200 bg-amber-50/80 px-4 py-2.5 text-[12.5px] text-warm transition hover:bg-amber-100/80">
              <Dot className="bg-warm" /> <b>{pending}</b> kayıt onay bekliyor — incelemek için tıklayın
            </Link>
          )}
          {missing.length > 0 && latest && (
            <span className="flex items-center gap-2.5 rounded-2xl border border-leaf-200 bg-white/70 px-4 py-2.5 text-[12.5px] text-ink/60">
              <Dot className="bg-leaf-500" />
              {MONTHS_TR[latest.month - 1]} {latest.year} için <b>{missing.length}</b> eksik veri:{" "}
              {missing.slice(0, 2).map((m) => `${m.facility} · ${categoryLabel(m.category)}`).join(", ")}
              {missing.length > 2 && ` +${missing.length - 2}`}
            </span>
          )}
        </div>
      )}

      {!hasData ? (
        <Card>
          <EmptyState
            title={`${year} yılına ait onaylı veri yok`}
            desc="Veri girişi sayfasından faaliyet verisi ekleyin ya da üstteki yıl seçiciyi değiştirin."
            action={<Link href="/veri-girisi" className="text-[13px] font-medium text-leaf-700 underline underline-offset-4">veri girişine git →</Link>}
          />
        </Card>
      ) : (
        <>
          <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rise-1">
              <KpiCard label="toplam emisyon" value={fmtTons(totals.total)} unit="tCO₂e" href="/raporlar"
                hint={`kapsam 1: ${fmtTons(totals.s1)} · 2: ${fmtTons(totals.s2)} · 3: ${fmtTons(totals.s3)}`} />
            </div>
            <div className="rise-2">
              <KpiCard label="yıllık değişim" value={yoy === null ? "—" : `${yoy > 0 ? "+" : ""}${fmt1(yoy)}`}
                unit={yoy === null ? undefined : "%"} href="/veri-kalite"
                hint={yoy === null ? "önceki yıl verisi yok" : `${year - 1} yılına göre`}
                tone={yoy !== null && yoy > 0 ? "warm" : "leaf"} />
            </div>
            <div className="rise-3">
              <KpiCard label="kişi başı emisyon" value={perCapita === null ? "—" : fmt1(perCapita)}
                unit={perCapita === null ? undefined : "tCO₂e/kişi"} href="/tesisler"
                hint={staff > 0 ? `${staff.toLocaleString("tr-TR")} personel` : "personel sayısı tanımlı değil"} />
            </div>
            <div className="rise-4">
              <KpiCard label="hedef sapması" value={gap === null ? "—" : `${gap > 0 ? "+" : ""}${fmt1(gap)}`}
                unit={gap === null ? undefined : "%"} href="/ayarlar"
                hint={target ? `${year} hedefi: ${fmtTons(target.targetTCO2e)} tCO₂e` : "bu yıl için hedef tanımlanmamış"}
                tone={gap !== null && gap > 0 ? "danger" : "leaf"} />
            </div>
          </div>

          {tahmin && tahmin.gerceklesenAy < 12 && tahmin.tahminKalan > 0 && (
            <div className="rise-4 mb-6">
              <Card>
                <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[12.5px]">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-ink/45">yıl sonu tahmini</span>
                  <span className="text-[17px] font-semibold tabular-nums text-ink">{fmtTons(tahmin.yilSonu)} tCO₂e</span>
                  <span className="text-ink/50">
                    gerçekleşen {fmtTons(tahmin.gerceklesen)} ({tahmin.gerceklesenAy} ay) + mevsimsel projeksiyon {fmtTons(tahmin.tahminKalan)}
                  </span>
                  {target && (
                    <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${
                      tahmin.yilSonu > target.targetTCO2e ? "bg-amber-100 text-warm" : "bg-leaf-100 text-leaf-800"
                    }`}>
                      {tahmin.yilSonu > target.targetTCO2e
                        ? `hedefin ${fmt1(((tahmin.yilSonu - target.targetTCO2e) / target.targetTCO2e) * 100)}% üzerinde seyrediyor`
                        : "hedefle uyumlu seyrediyor"}
                    </span>
                  )}
                </div>
              </Card>
            </div>
          )}

          <div className="mb-6 grid gap-4 xl:grid-cols-[1.6fr_1fr]">
            <MonthlyTrendChart data={monthlyData} year={year} />
            <ScopeDonut s1={totals.s1} s2={totals.s2} s3={totals.s3} />
          </div>

          <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
            <SourceSankey rows={sankeyRows} />
            <TopFacilitiesChart rows={topFacilities} />
          </div>
        </>
      )}
    </>
  );
}

function Dot({ className }: { className: string }) {
  return <span className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${className}`} />;
}
