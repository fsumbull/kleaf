/**
 * Kent ölçeği envanter (GPC BASIC sadeleştirmesi) — yalnızca belediyeler.
 * Kurumsal envanterden bağımsız: CityActivity kayıtları + kütüphane faktörleriyle
 * sektör emisyonları, kişi başı emisyon ve mahalle nüfus dağılımı.
 */
import { redirect } from "next/navigation";
import { getScope } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolveFactor, categoryLabel } from "@/lib/data";
import { CITY_SECTOR_LABELS, CATEGORIES, type CitySector } from "@/lib/constants";
import { PageHeader, Card, CardTitle, KpiCard, Table, Badge, EmptyState } from "@/components/ui";
import { KentCharts, KentAksiyonlar, KentVeriYonetim, type SectorSlice, type SectorYearRow } from "@/components/kent-client";
import { fmtInt, fmtTons, fmt2, fmtPct } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function KentPage() {
  const { session, org, year } = await getScope();
  if (org.type !== "BELEDIYE") redirect("/");
  const canManage = ["SUPER_ADMIN", "IKLIM_MERKEZI", "CBS_UZMANI"].includes(session.role);

  const [rows, neighborhoods] = await Promise.all([
    prisma.cityActivity.findMany({ where: { orgId: org.id }, orderBy: [{ year: "asc" }, { sector: "asc" }] }),
    prisma.neighborhood.findMany({ where: { orgId: org.id }, orderBy: { population: "desc" } }),
  ]);

  const years = [...new Set(rows.map((r) => r.year))].sort();
  /* Seçili yılda kent verisi yoksa en yakın geçmiş envanter yılına düş. */
  const refYear = years.includes(year) ? year : [...years].reverse().find((y) => y < year) ?? years.at(-1) ?? year;

  /* Kategori faktörleri (kurum tanımı > küresel) */
  const cats = [...new Set(rows.map((r) => r.category))];
  const factorEntries = await Promise.all(cats.map(async (c) => [c, (await resolveFactor(org.id, c))?.kgCO2ePerUnit ?? 0] as const));
  const factor = new Map(factorEntries);

  const tOf = (r: { category: string; amount: number }) => (r.amount * (factor.get(r.category) ?? 0)) / 1000;

  /* Sektör × yıl toplamları */
  const bySectorYear = new Map<string, Map<number, number>>();
  const byCat = new Map<string, { sector: string; category: string; amount: number; tCO2e: number }>();
  for (const r of rows) {
    const t = tOf(r);
    const m = bySectorYear.get(r.sector) ?? new Map<number, number>();
    m.set(r.year, (m.get(r.year) ?? 0) + t);
    bySectorYear.set(r.sector, m);
    if (r.year === refYear) {
      const key = `${r.sector}|${r.category}`;
      const e = byCat.get(key) ?? { sector: r.sector, category: r.category, amount: 0, tCO2e: 0 };
      e.amount += r.amount; e.tCO2e += t;
      byCat.set(key, e);
    }
  }

  const slices: SectorSlice[] = [...bySectorYear.entries()]
    .map(([sector, m]) => ({ sector, label: CITY_SECTOR_LABELS[sector as CitySector] ?? sector, tCO2e: m.get(refYear) ?? 0 }))
    .filter((s) => s.tCO2e > 0)
    .sort((a, b) => b.tCO2e - a.tCO2e);

  const yearRows: SectorYearRow[] = [...bySectorYear.entries()].map(([sector, m]) => ({
    sector,
    label: CITY_SECTOR_LABELS[sector as CitySector] ?? sector,
    values: years.map((y) => ({ year: y, tCO2e: m.get(y) ?? 0 })),
  })).sort((a, b) => (b.values.at(-1)?.tCO2e ?? 0) - (a.values.at(-1)?.tCO2e ?? 0));

  const total = slices.reduce((s, x) => s + x.tCO2e, 0);
  const prevTotal = [...bySectorYear.values()].reduce((s, m) => s + (m.get(refYear - 1) ?? 0), 0);
  const delta = prevTotal > 0 ? ((total - prevTotal) / prevTotal) * 100 : null;
  const population = neighborhoods.reduce((s, n) => s + n.population, 0);
  const perCapita = population > 0 ? total / population : 0;
  const topSector = slices[0];

  const catRows = [...byCat.values()].sort((a, b) => b.tCO2e - a.tCO2e);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="kent ölçeği"
        title="Kent envanteri"
        desc={`${org.name} sınırları içi topluluk emisyonları · ${refYear} envanter yılı${refYear !== year ? ` (seçili ${year} için kent verisi henüz derlenmedi)` : ""} · GPC BASIC sadeleştirmesi`}
        actions={canManage ? <KentAksiyonlar orgId={org.id} neighborhoods={neighborhoods.map((n) => ({ id: n.id, name: n.name, population: n.population }))} defaultYear={year} /> : undefined}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="kent toplam emisyonu" value={fmtTons(total)} unit="tCO₂e" hint={`${refYear} envanter yılı`}
          delta={delta ?? undefined} deltaGoodWhenNegative />
        <KpiCard label="kişi başı emisyon" value={fmt2(perCapita)} unit="tCO₂e/kişi"
          hint={`${fmtInt(population)} kişilik nüfus tabanı`} tone={perCapita <= 5 ? "leaf" : undefined} />
        <KpiCard label="en büyük sektör" value={topSector?.label ?? "—"}
          hint={topSector ? `${fmtTons(topSector.tCO2e)} tCO₂e · ${fmtPct((topSector.tCO2e / (total || 1)) * 100, false)} pay` : "veri yok"} />
        <KpiCard label="izlenen mahalle" value={String(neighborhoods.length)} unit="adet"
          hint="nüfus tabanı mahalle kayıtlarından" />
      </div>

      {slices.length === 0 ? (
        <Card>
          <EmptyState
            title="Kent envanter verisi yok"
            desc={canManage ? "Sağ üstteki 'sektör verisi' düğmesiyle ilk kaydı ekleyin." : "CityActivity kayıtları eklendiğinde sektör dağılımı ve kişi başı emisyon burada görünecek."}
          />
        </Card>
      ) : (
        <>
          <KentCharts slices={slices} yearRows={yearRows} years={years} />

          <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
            <Card pad={false}>
              <div className="px-5 pt-5">
                <CardTitle right={<span className="text-[11px] text-ink/40">aktivite verisi × kütüphane faktörü</span>}>{`sektör kırılımı · ${refYear}`}</CardTitle>
              </div>
              <Table dense head={<><th>sektör</th><th>kategori</th><th>aktivite</th><th>emisyon</th><th>pay</th></>}>
                {catRows.map((r) => (
                  <tr key={`${r.sector}|${r.category}`}>
                    <td className="font-medium">{CITY_SECTOR_LABELS[r.sector as CitySector] ?? r.sector}</td>
                    <td>{categoryLabel(r.category)}</td>
                    <td className="tabular-nums">{fmtInt(r.amount)} {CATEGORIES.find((c) => c.code === r.category)?.unit ?? ""}</td>
                    <td className="tabular-nums">{fmtTons(r.tCO2e)} tCO₂e</td>
                    <td>
                      <Badge tone={r.tCO2e / (total || 1) >= 0.2 ? "warm" : "gray"}>
                        {fmtPct((r.tCO2e / (total || 1)) * 100, false)}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </Table>
            </Card>

            <Card pad={false}>
              <div className="px-5 pt-5">
                <CardTitle right={<span className="text-[11px] text-ink/40">kişi başı pay nüfusla orantılanır</span>}>mahalle nüfus dağılımı</CardTitle>
              </div>
              <Table dense head={<><th>mahalle</th><th>nüfus</th><th>tahmini pay</th></>}>
                {neighborhoods.map((n) => (
                  <tr key={n.id}>
                    <td className="font-medium">{n.name}</td>
                    <td className="tabular-nums">{fmtInt(n.population)}</td>
                    <td className="tabular-nums">{fmtTons(population > 0 ? (n.population / population) * total : 0)} tCO₂e</td>
                  </tr>
                ))}
              </Table>
            </Card>
          </div>
        </>
      )}

      {canManage && (
        <KentVeriYonetim
          orgId={org.id}
          refYear={refYear}
          neighborhoods={neighborhoods.map((n) => ({ id: n.id, name: n.name, population: n.population }))}
          rows={rows
            .filter((r) => r.year === refYear)
            .map((r) => ({ id: r.id, year: r.year, sector: r.sector, category: r.category, amount: r.amount, neighborhoodId: r.neighborhoodId }))}
        />
      )}
    </div>
  );
}
