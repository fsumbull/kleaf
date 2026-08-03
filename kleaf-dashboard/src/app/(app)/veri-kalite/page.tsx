/* Veri kalitesi — skor, kırılım, eksik veri ve aykırı kayıt analizi (eylemleştirilmiş) */
import Link from "next/link";
import { getScope } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getLatestPeriod, getMissingData, categoryLabel } from "@/lib/data";
import { detectAnomalies, qualityScore } from "@/lib/carbon/engine";
import { MONTHS_TR } from "@/lib/constants";
import { PageHeader, Card, CardTitle, KpiCard, Table, Badge, EmptyState } from "@/components/ui";
import { TesisFiltre, AnomaliOnayToggle } from "@/components/kalite-client";
import { fmt1, fmtInt } from "@/lib/format";

interface AnomalyRow {
  id: string;
  facilityId: string;
  facility: string;
  category: string;
  year: number;
  month: number;
  period: string;
  amount: number;
  unit: string;
  median: number;
  deviationPct: number;
  severity: "orta" | "yuksek";
  status: string;
  anomalyOk: boolean;
}

export default async function VeriKalitePage({ searchParams }: { searchParams: Promise<{ tesis?: string }> }) {
  const { session, org, year } = await getScope();
  const sp = await searchParams;
  const canVerify = ["SUPER_ADMIN", "IKLIM_MERKEZI"].includes(session.role);

  const [facilities, latest] = await Promise.all([
    prisma.facility.findMany({ where: { orgId: org.id }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    getLatestPeriod(org.id),
  ]);
  const tesisFilter = facilities.some((f) => f.id === sp.tesis) ? sp.tesis! : "";

  const activities = await prisma.activityData.findMany({
    where: { facility: { orgId: org.id }, ...(tesisFilter ? { facilityId: tesisFilter } : {}) },
    select: {
      id: true, year: true, month: true, category: true, amount: true, unit: true, status: true,
      documentRef: true, vehicleKey: true, facilityId: true, anomalyOk: true,
      facility: { select: { name: true } },
      vehicle: { select: { plateNo: true } },
    },
    orderBy: [{ year: "asc" }, { month: "asc" }],
  });

  const yearRows = activities.filter((a) => a.year === year);

  /* aykırı tespiti: tesis × kategori × araç serisi (son 24 nokta) — havuz ve araç kayıtları ayrı seriler */
  const seriesMap = new Map<string, {
    key: string; facilityId: string; facility: string; category: string;
    pts: { id: string; year: number; month: number; amount: number; unit: string; status: string; anomalyOk: boolean }[];
  }>();
  for (const a of activities) {
    const key = `${a.facility.name}|${a.category}|${a.vehicleKey}`;
    const label = a.vehicle ? `${a.facility.name} · ${a.vehicle.plateNo}` : a.facility.name;
    const s = seriesMap.get(key) ?? { key, facilityId: a.facilityId, facility: label, category: a.category, pts: [] };
    s.pts.push({ id: a.id, year: a.year, month: a.month, amount: a.amount, unit: a.unit, status: a.status, anomalyOk: a.anomalyOk });
    seriesMap.set(key, s);
  }

  const anomalyRows: AnomalyRow[] = [];
  for (const s of seriesMap.values()) {
    const pts = s.pts.slice(-24);
    const found = detectAnomalies(pts.map((p) => p.amount));
    for (const an of found) {
      const p = pts[an.index];
      if (p.year !== year) continue;
      anomalyRows.push({
        id: p.id,
        facilityId: s.facilityId,
        facility: s.facility,
        category: s.category,
        year: p.year,
        month: p.month,
        period: `${MONTHS_TR[p.month - 1]} ${p.year}`,
        amount: p.amount,
        unit: p.unit,
        median: an.median,
        deviationPct: an.deviationPct,
        severity: an.severity,
        status: p.status,
        anomalyOk: p.anomalyOk,
      });
    }
  }
  anomalyRows.sort((a, b) => Number(a.anomalyOk) - Number(b.anomalyOk) || Math.abs(b.deviationPct) - Math.abs(a.deviationPct));
  const openAnomalies = anomalyRows.filter((r) => !r.anomalyOk); // doğrulananlar skordan düşer

  /* kalite skoru girdileri */
  const monthsElapsed = latest && latest.year === year ? latest.month : latest && latest.year > year ? 12 : 0;
  const pairSet = new Set(yearRows.map((a) => `${a.facility.name}|${a.category}`));
  const beklenenHucre = pairSet.size * Math.max(1, monthsElapsed);
  const doluHucre = new Set(yearRows.map((a) => `${a.facility.name}|${a.category}|${a.month}`)).size;

  const q = qualityScore({
    beklenenHucre,
    doluHucre,
    toplamKayit: yearRows.length,
    onayliKayit: yearRows.filter((a) => a.status === "ONAYLI").length,
    belgeliKayit: yearRows.filter((a) => a.documentRef).length,
    aykiriKayit: openAnomalies.length,
  });

  const missingAll = latest ? await getMissingData(org.id, latest.year, latest.month) : [];
  const missing = tesisFilter ? missingAll.filter((m) => m.facilityId === tesisFilter) : missingAll;

  return (
    <>
      <PageHeader
        eyebrow="veri kalitesi"
        title="Veri kalite paneli"
        desc={`${org.name} · ${year} envanter verisinin tamlık, onay ve tutarlılık analizi`}
        actions={<TesisFiltre facilities={facilities} value={tesisFilter} />}
      />

      <div className="rise grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="kalite skoru" value={q ? String(q.skor) : "—"} unit="/ 100"
          tone={q && q.skor >= 70 ? "leaf" : "warm"}
          hint="0.4×tamlık + 0.3×onay + 0.2×belge + 0.1×tutarlılık" />
        <KpiCard label="veri tamlığı" value={q ? fmtInt(q.tamlik * 100) : "—"} unit="%"
          hint={`${doluHucre} / ${beklenenHucre} beklenen hücre`} />
        <KpiCard label="onay oranı" value={q ? fmtInt(q.onay * 100) : "—"} unit="%"
          hint={`${yearRows.filter((a) => a.status === "ONAYLI").length} / ${yearRows.length} kayıt onaylı`} />
        <KpiCard label="açık aykırı kayıt" value={String(openAnomalies.length)} unit="adet"
          tone={openAnomalies.length > 0 ? "warm" : "leaf"}
          hint={anomalyRows.length > openAnomalies.length
            ? `${anomalyRows.length - openAnomalies.length} kayıt doğrulandı`
            : "medyan + MAD sapma analizi"} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-5">
        <Card className="rise-1 lg:col-span-2">
          <CardTitle>skor kırılımı</CardTitle>
          {!q ? (
            <EmptyState title="Bu yıl kayıt yok" />
          ) : (
            <ul className="space-y-3.5">
              <ScoreBar label="tamlık (ağırlık 0.4)" pct={q.tamlik * 100} />
              <ScoreBar label="onay (ağırlık 0.3)" pct={q.onay * 100} />
              <ScoreBar label="belge (ağırlık 0.2)" pct={q.belge * 100} />
              <ScoreBar label="tutarlılık (ağırlık 0.1)" pct={(1 - q.aykiri) * 100} />
            </ul>
          )}
          <p className="mt-4 rounded-xl bg-leaf-50 px-3 py-2 text-[11.5px] leading-relaxed text-leaf-800">
            Belge oranını artırmak için veri girişinde fatura/sayaç referansı ekleyin; onay oranı için taslak kayıtları
            veri girişi sayfasından onaylayın. Gerçek tüketim sıçramalarını &quot;doğrula&quot; ile işaretleyin — skora yansımaz.
          </p>
        </Card>

        <Card className="rise-2 lg:col-span-3" pad={false}>
          <div className="px-5 pt-4">
            <h2 className="text-[14px] font-bold tracking-tight text-ink">
              eksik veri{latest ? ` · ${MONTHS_TR[latest.month - 1]} ${latest.year}` : ""}
            </h2>
            <p className="mt-0.5 text-[11.5px] text-ink/45">tesiste daha önce görülen ama son dönemde girilmeyen kategoriler — satırdan ön dolu kayıt açın</p>
          </div>
          {missing.length === 0 ? (
            <EmptyState title="Eksik veri yok" desc="Son dönemde tüm beklenen kategoriler girilmiş." />
          ) : (
            <div className="max-h-[320px] overflow-y-auto p-2">
              <Table dense head={<><th>tesis</th><th>eksik kategori</th><th className="text-right">işlem</th></>}>
                {missing.map((m, i) => (
                  <tr key={i}>
                    <td className="max-w-[240px] truncate font-medium">{m.facility}</td>
                    <td>{categoryLabel(m.category)}</td>
                    <td className="text-right">
                      <Link
                        href={`/veri-girisi?yeni=1&tesis=${m.facilityId}&kategori=${m.category}&ay=${latest!.month}&yil=${latest!.year}`}
                        className="rounded-lg border border-leaf-900/10 px-2 py-1 text-[11px] font-semibold text-leaf-700 transition hover:border-leaf-500 hover:bg-leaf-50"
                      >
                        + kayıt gir
                      </Link>
                    </td>
                  </tr>
                ))}
              </Table>
            </div>
          )}
        </Card>
      </div>

      <Card className="rise-3 mt-4" pad={false}>
        <div className="px-5 pt-4">
          <h2 className="text-[14px] font-bold tracking-tight text-ink">aykırı kayıtlar · {year}</h2>
          <p className="mt-0.5 text-[11.5px] text-ink/45">
            tesis × kategori serilerinde medyandan aşırı sapan değerler — dönem bağlantısıyla kaydı inceleyin,
            gerçek tüketimse doğrulayın
          </p>
        </div>
        {anomalyRows.length === 0 ? (
          <EmptyState title="Aykırı kayıt bulunamadı" desc="Tüm seriler beklenen aralıkta." />
        ) : (
          <div className="p-2">
            <Table dense head={<>
              <th>tesis</th><th>kategori</th><th>dönem</th>
              <th className="text-right">değer</th><th className="text-right">medyan</th>
              <th className="text-right">sapma</th><th>şiddet</th><th>durum</th>
              {canVerify ? <th className="text-right">doğrulama</th> : <th />}
            </>}>
              {anomalyRows.map((r) => (
                <tr key={r.id} className={r.anomalyOk ? "opacity-50" : ""}>
                  <td className="max-w-[200px] truncate font-medium">{r.facility}</td>
                  <td>{categoryLabel(r.category)}</td>
                  <td className="whitespace-nowrap">
                    <Link
                      href={`/veri-girisi?yil=${r.year}&ay=${r.month}&tesis=${r.facilityId}&kategori=${r.category}`}
                      className="font-medium text-leaf-700 underline decoration-leaf-300 underline-offset-2 transition hover:text-leaf-900"
                      title="Veri girişinde filtrele ve incele"
                    >
                      {r.period}
                    </Link>
                  </td>
                  <td className="whitespace-nowrap text-right tabular-nums">{fmt1(r.amount)} {r.unit}</td>
                  <td className="whitespace-nowrap text-right tabular-nums text-ink/55">{fmt1(r.median)}</td>
                  <td className="whitespace-nowrap text-right tabular-nums">
                    {r.deviationPct > 0 ? "+" : ""}{fmtInt(r.deviationPct)}%
                  </td>
                  <td><Badge tone={r.severity === "yuksek" ? "danger" : "warm"}>{r.severity === "yuksek" ? "yüksek" : "orta"}</Badge></td>
                  <td><Badge tone={r.status === "ONAYLI" ? "leaf" : "gray"}>{r.status === "ONAYLI" ? "onaylı" : "taslak"}</Badge></td>
                  {canVerify ? (
                    <td className="text-right"><AnomaliOnayToggle id={r.id} anomalyOk={r.anomalyOk} /></td>
                  ) : (
                    <td className="text-right text-[11px] text-ink/40">{r.anomalyOk ? "doğrulandı" : ""}</td>
                  )}
                </tr>
              ))}
            </Table>
          </div>
        )}
      </Card>
    </>
  );
}

function ScoreBar({ label, pct }: { label: string; pct: number }) {
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <li>
      <div className="mb-1 flex justify-between text-[12px]">
        <span className="text-ink/60">{label}</span>
        <span className="font-semibold text-ink">%{fmtInt(clamped)}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-leaf-100">
        <div
          className={`h-full rounded-full ${clamped >= 70 ? "bg-gradient-to-r from-leaf-600 to-leaf-400" : "bg-gradient-to-r from-warm to-leaf-400"}`}
          style={{ width: `${clamped}%` }}
        />
      </div>
    </li>
  );
}
