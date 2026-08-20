import { getScope } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader, Card, Table, Badge, EmptyState } from "@/components/ui";
import { fmtTons } from "@/lib/format";

const ratingTone = (r: string | null): "leaf" | "warm" | "gray" => (r === "A" ? "leaf" : r === "B" ? "warm" : "gray");

export default async function GelistiricilerPage() {
  const { org } = await getScope();
  if (org.type !== "KARBON_BANK") return <Card className="rise-1"><EmptyState title="KarbonBank'a özel sayfa" desc="Belediye paneli: http://localhost:3100" /></Card>;

  const devs = await prisma.projectDeveloper.findMany({
    where: { bankOrgId: org.id },
    include: { projects: { select: { expectedTCO2e: true, stage: true } } },
    orderBy: { name: "asc" },
  });

  return (
    <>
      <PageHeader eyebrow="tedarik" title="Proje geliştiriciler" desc={`${org.name} · ${devs.length} tedarikçi — kredi projelerinin kaynağı`} />
      <Card className="rise-1">
        <Table head={<>
          <th>geliştirici</th><th>ülke</th><th>güven notu</th><th>proje sayısı</th><th>aktif</th><th>toplam beklenen tCO₂e</th><th>iletişim</th>
        </>}>
          {devs.map((d) => {
            const aktif = d.projects.filter((p) => p.stage === "AKTIF").length;
            const hacim = d.projects.reduce((a, p) => a + p.expectedTCO2e, 0);
            return (
              <tr key={d.id}>
                <td className="font-medium text-ink">{d.name}</td>
                <td>{d.country}</td>
                <td><Badge tone={ratingTone(d.rating)}>{d.rating ?? "—"}</Badge></td>
                <td className="tabular-nums">{d.projects.length}</td>
                <td className="tabular-nums">{aktif}</td>
                <td className="tabular-nums">{fmtTons(hacim)}</td>
                <td className="text-ink/55">{d.contact ?? "—"}</td>
              </tr>
            );
          })}
        </Table>
      </Card>
    </>
  );
}
