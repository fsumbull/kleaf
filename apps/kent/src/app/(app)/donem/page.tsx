/* Dönem yönetimi — aylık veri dönemlerinin kilit durumu ve tamamlanma özeti */
import { requireSession, getScope } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader, Card, Table, Badge } from "@/components/ui";
import { DonemToggle } from "@/components/donem-client";
import { MONTHS_TR } from "@/lib/constants";

export default async function DonemPage() {
  const session = await requireSession(["SUPER_ADMIN", "IKLIM_MERKEZI", "MUDURLUK_ONAY"]);
  const { org, year } = await getScope();
  const canManage = session.role === "SUPER_ADMIN" || session.role === "IKLIM_MERKEZI";

  const [periods, rows] = await Promise.all([
    prisma.period.findMany({ where: { orgId: org.id, year } }),
    prisma.activityData.groupBy({
      by: ["month", "status"],
      where: { facility: { orgId: org.id }, year },
      _count: { _all: true },
    }),
  ]);
  const pMap = new Map(periods.map((p) => [p.month, p]));

  const months = Array.from({ length: 12 }, (_, i) => i + 1).map((m) => {
    const of = (s: string) => rows.find((r) => r.month === m && r.status === s)?._count._all ?? 0;
    const taslak = of("TASLAK"), ara = of("MUDURLUK_ONAYLI"), onayli = of("ONAYLI");
    return { m, taslak, ara, onayli, toplam: taslak + ara + onayli, kapali: pMap.get(m)?.status === "KAPANDI" };
  });

  return (
    <>
      <PageHeader
        eyebrow="veri yönetişimi"
        title="Dönem yönetimi"
        desc={`${org.name} · ${year} yılı aylık dönemlerin kilit durumu. Kapanan dönemde veri girişi ve düzenleme yapılamaz.`}
      />
      <Card pad={false} className="rise-1">
        <Table
          head={
            <>
              <th>dönem</th>
              <th className="text-right">taslak</th>
              <th className="text-right">müdürlük onaylı</th>
              <th className="text-right">onaylı</th>
              <th className="text-right">toplam kayıt</th>
              <th>durum</th>
              <th className="w-40 text-right"></th>
            </>
          }
        >
          {months.map(({ m, taslak, ara, onayli, toplam, kapali }) => (
            <tr key={m}>
              <td className="font-semibold">{MONTHS_TR[m - 1]} {year}</td>
              <td className="text-right tabular-nums">{taslak || "—"}</td>
              <td className="text-right tabular-nums">{ara || "—"}</td>
              <td className="text-right tabular-nums">{onayli || "—"}</td>
              <td className="text-right tabular-nums">{toplam || "—"}</td>
              <td>
                {kapali ? <Badge tone="gray">kapandı</Badge>
                  : taslak + ara > 0 ? <Badge tone="warm">onay bekliyor</Badge>
                  : <Badge tone="leaf">açık</Badge>}
              </td>
              <td className="text-right">
                {toplam > 0 && <DonemToggle year={year} month={m} kapali={kapali} canManage={canManage} />}
              </td>
            </tr>
          ))}
        </Table>
      </Card>
      <p className="mt-4 text-[11.5px] text-ink/40">
        Dönem kapatma için tüm kayıtların onaylı olması gerekir. Kapanan dönem yalnız iklim merkezi tarafından yeniden açılabilir.
      </p>
    </>
  );
}
