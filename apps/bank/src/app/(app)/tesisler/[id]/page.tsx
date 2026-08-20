import Link from "next/link";
import { notFound } from "next/navigation";
import { getScope } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { categoryLabel } from "@/lib/data";
import { monthlyScopeTotals, totalsByCategory, type EmissionRow } from "@/lib/carbon/engine";
import { PageHeader, Card, CardTitle, KpiCard, Table, StatusPill, EmptyState } from "@/components/ui";
import { MonthlyTrendChart } from "@/components/overview-charts";
import { FACILITY_TYPE_LABELS, MONTHS_TR, type FacilityType, type CategoryCode } from "@/lib/constants";
import { fmtTons, fmt2, fmtInt } from "@/lib/format";

export default async function TesisDetay({ params }: { params: Promise<{ id: string }> }) {
  const { org, year } = await getScope();
  const { id } = await params;

  const facility = await prisma.facility.findFirst({
    where: { id, orgId: org.id },
    include: { unit: { select: { name: true } } },
  });
  if (!facility) notFound();

  const activities = await prisma.activityData.findMany({
    where: { facilityId: id, year },
    include: { emissionRecord: { select: { scope: true, tCO2e: true } } },
    orderBy: [{ month: "desc" }, { category: "asc" }],
  });

  const rows: EmissionRow[] = activities
    .filter((a) => a.emissionRecord)
    .map((a) => ({
      year: a.year, month: a.month, category: a.category as CategoryCode,
      scope: a.emissionRecord!.scope as 1 | 2 | 3, tCO2e: a.emissionRecord!.tCO2e, facilityId: id,
    }));

  const monthly = monthlyScopeTotals(rows);
  const monthlyData = Array.from({ length: 12 }, (_, i) => {
    const t = monthly.get(`${year}-${String(i + 1).padStart(2, "0")}`);
    return { month: i + 1, s1: t?.s1 ?? 0, s2: t?.s2 ?? 0, s3: t?.s3 ?? 0 };
  });
  const total = monthlyData.reduce((s, m) => s + m.s1 + m.s2 + m.s3, 0);
  const byCat = [...totalsByCategory(rows).entries()].sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));

  return (
    <>
      <PageHeader
        eyebrow="tesis detayı"
        title={facility.name}
        desc={[
          FACILITY_TYPE_LABELS[facility.type as FacilityType] ?? facility.type,
          facility.unit?.name,
          facility.areaM2 ? `${fmtInt(facility.areaM2)} m²` : null,
          facility.staffCount ? `${fmtInt(facility.staffCount)} personel` : null,
        ].filter(Boolean).join(" · ")}
        actions={<Link href="/tesisler" className="text-[12.5px] font-medium text-leaf-700 underline underline-offset-4">← tüm tesisler</Link>}
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <div className="rise-1">
          <KpiCard label={`${year} toplam`} value={fmtTons(total)} unit="tCO₂e"
            hint={facility.type === "GES" ? "GES üretimi envantere mahsup (−) yazılır" : undefined} />
        </div>
        <div className="rise-2">
          <KpiCard label="kayıt sayısı" value={String(activities.length)}
            hint={`${activities.filter((a) => a.status === "TASLAK").length} taslak`} />
        </div>
        <div className="rise-3">
          <KpiCard label="en büyük kaynak"
            value={byCat[0] ? categoryLabel(byCat[0][0]) : "—"}
            hint={byCat[0] ? `${fmtTons(byCat[0][1])} tCO₂e` : "onaylı veri yok"} />
        </div>
      </div>

      <div className="mb-6">
        <MonthlyTrendChart data={monthlyData} year={year} />
      </div>

      <Card className="rise-2" pad={false}>
        <div className="p-5 pb-0"><CardTitle>faaliyet kayıtları · {year}</CardTitle></div>
        {activities.length === 0 ? (
          <EmptyState title="Bu yıl için kayıt yok" desc="Veri girişi sayfasından bu tesise faaliyet verisi ekleyin." />
        ) : (
          <div className="p-4 pt-1">
            <Table dense head={<>
              <th>dönem</th><th>kategori</th><th className="text-right">miktar</th>
              <th className="text-right">tCO₂e</th><th>belge</th><th>durum</th>
            </>}>
              {activities.map((a) => (
                <tr key={a.id}>
                  <td className="whitespace-nowrap text-ink/60">{MONTHS_TR[a.month - 1]}</td>
                  <td>{categoryLabel(a.category)}</td>
                  <td className="whitespace-nowrap text-right tabular-nums">{fmt2(a.amount)} <span className="text-ink/40">{a.unit}</span></td>
                  <td className="whitespace-nowrap text-right tabular-nums">
                    {a.emissionRecord ? fmtTons(a.emissionRecord.tCO2e) : <span className="text-ink/30">—</span>}
                  </td>
                  <td className="max-w-[140px] truncate text-ink/45">{a.documentRef ?? "—"}</td>
                  <td><StatusPill status={a.status} /></td>
                </tr>
              ))}
            </Table>
          </div>
        )}
      </Card>
    </>
  );
}
