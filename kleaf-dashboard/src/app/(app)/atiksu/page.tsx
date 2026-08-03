/* Atıksu yönetimi — arıtma prosesi, metan kaçağı ve biyogaz kredisi dengesi */
import Link from "next/link";
import { getScope } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { atiksuDengesi, aritmaYogunlugu, ATIKSU_KATEGORILER } from "@/lib/carbon/engine";
import { MONTHS_TR, categoryMeta, CATEGORIES, type CategoryCode } from "@/lib/constants";
import { PageHeader, Card, Table, Badge } from "@/components/ui";
import { fmtTons, fmtInt, fmt2 } from "@/lib/format";

const CATS: CategoryCode[] = [...ATIKSU_KATEGORILER, "BIYOGAZ_URETIM"];

export default async function AtiksuPage() {
  const { org, year } = await getScope();

  const records = await prisma.activityData.findMany({
    where: { facility: { orgId: org.id }, category: { in: CATS }, year },
    select: {
      category: true, month: true, amount: true, status: true,
      facility: { select: { name: true } },
      emissionRecord: { select: { tCO2e: true } },
    },
    orderBy: [{ month: "asc" }],
  });

  const dengeRows = records
    .filter((r) => r.emissionRecord)
    .map((r) => ({ category: r.category as CategoryCode, tCO2e: r.emissionRecord!.tCO2e }));
  const denge = atiksuDengesi(dengeRows);
  const debiM3 = records.filter((r) => r.category === "ATIKSU_DEBI").reduce((s, r) => s + r.amount, 0);
  const camurTon = records.filter((r) => r.category === "CAMUR").reduce((s, r) => s + r.amount, 0);
  const biyogazKwh = records.filter((r) => r.category === "BIYOGAZ_URETIM").reduce((s, r) => s + r.amount, 0);
  const yogunluk = aritmaYogunlugu(denge.netTCO2e, debiM3);

  /* aylık kategori toplamları */
  const aylik = Array.from({ length: 12 }, (_, i) => {
    const m = i + 1;
    const of = (c: CategoryCode) => records.filter((r) => r.month === m && r.category === c).reduce((s, r) => s + r.amount, 0);
    return { m, debi: of("ATIKSU_DEBI"), enerji: of("ARITMA_ENERJI"), camur: of("CAMUR"), metan: of("ATIKSU_METAN"), biyogaz: of("BIYOGAZ_URETIM") };
  }).filter((r) => r.debi + r.enerji + r.camur + r.metan + r.biyogaz > 0);

  const catLabel = new Map(CATEGORIES.map((c) => [c.code, c.label]));

  const kpis: { label: string; value: string; sub: string }[] = [
    { label: "arıtılan atıksu", value: `${fmtInt(debiM3)} m³`, sub: `${year} toplam debi` },
    { label: "net emisyon", value: `${fmtTons(denge.netTCO2e)} tCO₂e`, sub: "arıtma + metan − biyogaz kredisi" },
    { label: "metan kaçağı", value: `${fmtTons(denge.metanTCO2e)} tCO₂e`, sub: "proses kaynaklı doğrudan salım" },
    { label: "biyogaz kredisi", value: `−${fmtTons(denge.krediTCO2e)} tCO₂e`, sub: `${fmtInt(biyogazKwh)} kWh üretim` },
    { label: "arıtma yoğunluğu", value: yogunluk === null ? "—" : `${fmt2(yogunluk)} kg/m³`, sub: "kgCO₂e / arıtılan m³" },
    { label: "çamur", value: `${fmtInt(camurTon)} ton`, sub: "bertaraf edilen arıtma çamuru" },
  ];

  return (
    <>
      <PageHeader
        eyebrow="atıksu yönetimi"
        title="Arıtma tesisi karbon dengesi"
        desc={`${org.name} · ${year} atıksu arıtma emisyonları ve biyogaz geri kazanımı`}
        actions={
          <Link href="/veri-girisi?kategori=ATIKSU_DEBI" className="rounded-xl border border-leaf-200 bg-white/70 px-3.5 py-2 text-[12.5px] font-medium text-leaf-700 transition hover:bg-leaf-50">
            atıksu verisi gir →
          </Link>
        }
      />

      <div className="rise mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {kpis.map((k) => (
          <Card key={k.label}>
            <p className="eyebrow mb-1">{k.label}</p>
            <p className="text-[22px] font-bold tracking-tight tabular-nums">{k.value}</p>
            <p className="mt-0.5 text-[11.5px] text-ink/45">{k.sub}</p>
          </Card>
        ))}
      </div>

      <Card pad={false} className="rise-1">
        {aylik.length === 0 ? (
          <p className="p-6 text-[13px] text-ink/50">{year} yılı için atıksu kaydı yok. Veri girişinden ATIKSU_DEBI, ARITMA_ENERJI, CAMUR, ATIKSU_METAN ve BIYOGAZ_URETIM kategorilerini kullanın.</p>
        ) : (
          <Table
            head={<>
              <th>ay</th>
              <th className="text-right">debi (m³)</th>
              <th className="text-right">arıtma enerjisi (kWh)</th>
              <th className="text-right">çamur (ton)</th>
              <th className="text-right">metan (kgCO₂e)</th>
              <th className="text-right">biyogaz (kWh)</th>
            </>}
          >
            {aylik.map((r) => (
              <tr key={r.m}>
                <td className="font-medium">{MONTHS_TR[r.m - 1]}</td>
                <td className="text-right tabular-nums">{fmtInt(r.debi)}</td>
                <td className="text-right tabular-nums">{fmtInt(r.enerji)}</td>
                <td className="text-right tabular-nums">{fmtInt(r.camur)}</td>
                <td className="text-right tabular-nums">{fmtInt(r.metan)}</td>
                <td className="text-right tabular-nums text-leaf-700">{fmtInt(r.biyogaz)}</td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      <p className="mt-4 text-[11.5px] text-ink/40">
        Kapsamlar: metan kaçağı Kapsam 1 · arıtma enerjisi Kapsam 2 · debi ve çamur Kapsam 3 · biyogaz üretimi Kapsam 2 mahsubu.
        {" "}Kategoriler: {CATS.map((c) => catLabel.get(c) ?? categoryMeta(c).unit).join(" · ")}.
      </p>
    </>
  );
}
