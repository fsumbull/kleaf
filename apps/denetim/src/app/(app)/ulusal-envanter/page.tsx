import { getScope } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader, Card, CardTitle, KpiCard, Table, Badge, EmptyState } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function UlusalEnvanterPage() {
  const { org } = await getScope();
  if (org.type !== "KLEAF") return <Card><EmptyState title="Yalnız KLEAF denetçisi" desc="" /></Card>;

  const belediyeler = await prisma.organization.findMany({
    where: { type: "BELEDIYE" },
    select: {
      id: true, name: true, portalAcik: true, netZeroYear: true,
    },
    orderBy: { name: "asc" },
  });

  // Tüm belediye emisyon kayıtları
  const records = await prisma.emissionRecord.findMany({
    where: { activityData: { facility: { org: { type: "BELEDIYE" } } } },
    select: {
      scope: true, tCO2e: true,
      activityData: {
        select: {
          year: true, category: true,
          facility: { select: { org: { select: { id: true, name: true } } } },
        },
      },
    },
  });

  const toplamTCO2e = records.reduce((a, r) => a + r.tCO2e, 0);
  const kapsam = { 1: 0, 2: 0, 3: 0 } as Record<number, number>;
  for (const r of records) kapsam[r.scope] = (kapsam[r.scope] ?? 0) + r.tCO2e;

  // Kategori bazlı toplam (top 8)
  const kategoriMap = new Map<string, number>();
  for (const r of records) {
    const k = r.activityData.category;
    kategoriMap.set(k, (kategoriMap.get(k) ?? 0) + r.tCO2e);
  }
  const kategoriler = Array.from(kategoriMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);
  const maxKategori = kategoriler[0]?.[1] ?? 1;

  // Yıllık trend
  const yilMap = new Map<number, number>();
  for (const r of records) {
    const y = r.activityData.year;
    yilMap.set(y, (yilMap.get(y) ?? 0) + r.tCO2e);
  }
  const yillar = Array.from(yilMap.entries()).sort((a, b) => a[0] - b[0]);
  const maxYil = Math.max(1, ...yillar.map(([, v]) => v));

  // Belediye bazında toplam
  const belMap = new Map<string, { name: string; toplam: number }>();
  for (const r of records) {
    const o = r.activityData.facility.org;
    const cur = belMap.get(o.id) ?? { name: o.name, toplam: 0 };
    cur.toplam += r.tCO2e;
    belMap.set(o.id, cur);
  }
  const belSirali = Array.from(belMap.values()).sort((a, b) => b.toplam - a.toplam);

  const mtCO2e = toplamTCO2e / 1_000_000;

  return (
    <>
      <PageHeader
        eyebrow="ulusal envanter"
        title="Türkiye toplam sera gazı envanteri"
        desc={`${belediyeler.length} belediye · ${records.length.toLocaleString("tr-TR")} kayıt · ${yillar.length} yıl kapsam`}
      />

      <div className="rise mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="toplam envanter" value={mtCO2e >= 1 ? mtCO2e.toLocaleString("tr-TR", { maximumFractionDigits: 2 }) : (toplamTCO2e / 1000).toLocaleString("tr-TR", { maximumFractionDigits: 1 })} unit={mtCO2e >= 1 ? "MtCO₂e" : "ktCO₂e"} hint="tüm kapsam · tüm belediye" tone="leaf" />
        <KpiCard label="kapsam 1" value={(kapsam[1] / 1000).toLocaleString("tr-TR", { maximumFractionDigits: 1 })} unit="ktCO₂e" hint={`%${((kapsam[1] / toplamTCO2e) * 100).toFixed(1)}`} tone="leaf" />
        <KpiCard label="kapsam 2" value={(kapsam[2] / 1000).toLocaleString("tr-TR", { maximumFractionDigits: 1 })} unit="ktCO₂e" hint={`%${((kapsam[2] / toplamTCO2e) * 100).toFixed(1)}`} tone="leaf" />
        <KpiCard label="kapsam 3" value={(kapsam[3] / 1000).toLocaleString("tr-TR", { maximumFractionDigits: 1 })} unit="ktCO₂e" hint={`%${((kapsam[3] / toplamTCO2e) * 100).toFixed(1)}`} tone="leaf" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardTitle>Kategori dağılımı (top 8)</CardTitle>
          {kategoriler.length === 0 ? <EmptyState title="Kayıt yok" desc="" /> : (
            <div className="space-y-2">
              {kategoriler.map(([kat, val]) => (
                <div key={kat}>
                  <div className="mb-1 flex items-baseline justify-between text-[12px]">
                    <span className="lowercase text-ink/70">{kat}</span>
                    <span className="text-ink/50">{(val / 1000).toLocaleString("tr-TR", { maximumFractionDigits: 1 })} ktCO₂e</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded bg-ink/5">
                    <div className="h-full rounded bg-leaf-500" style={{ width: `${(val / maxKategori) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <CardTitle>Yıllık trend</CardTitle>
          {yillar.length === 0 ? <EmptyState title="Kayıt yok" desc="" /> : (
            <div className="flex h-40 items-end gap-2">
              {yillar.map(([y, v]) => (
                <div key={y} className="flex flex-1 flex-col items-center gap-1">
                  <div className="w-full rounded-t bg-leaf-500" style={{ height: `${(v / maxYil) * 100}%`, minHeight: "4px" }} />
                  <span className="text-[10.5px] text-ink/50">{y}</span>
                </div>
              ))}
            </div>
          )}
          <p className="mt-3 text-[11px] text-ink/45">bar yüksekliği yıllık toplam tCO₂e ile orantılı</p>
        </Card>
      </div>

      <div className="mt-4">
        <Card>
          <CardTitle>Belediye bazında toplam</CardTitle>
          <Table head={["Belediye", "Toplam (ktCO₂e)", "Pay", "Portal", "Net-sıfır"]} dense>
            {belSirali.length === 0 ? (
              <tr><td colSpan={5} className="p-4 text-center text-ink/45">Kayıt yok</td></tr>
            ) : belSirali.map((b) => {
              const bel = belediyeler.find((x) => x.name === b.name);
              return (
                <tr key={b.name}>
                  <td className="p-2">{b.name}</td>
                  <td className="p-2 text-right tabular-nums">{(b.toplam / 1000).toLocaleString("tr-TR", { maximumFractionDigits: 1 })}</td>
                  <td className="p-2 text-right tabular-nums">%{((b.toplam / toplamTCO2e) * 100).toFixed(1)}</td>
                  <td className="p-2">{bel?.portalAcik ? <Badge tone="leaf">açık</Badge> : <Badge tone="gray">kapalı</Badge>}</td>
                  <td className="p-2">{bel?.netZeroYear ?? "—"}</td>
                </tr>
              );
            })}
          </Table>
        </Card>
      </div>
    </>
  );
}
