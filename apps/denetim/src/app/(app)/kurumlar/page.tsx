import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader, Card, Table } from "@/components/ui";
import { KurumEkleButonu, KurumSilButonu, KurumTuruEtiketi } from "@/components/kurum-client";
import { fmtInt } from "@/lib/format";

export default async function KurumlarPage() {
  await requireSession(["SUPER_ADMIN"]);

  const orgs = await prisma.organization.findMany({
    orderBy: { name: "asc" },
    include: {
      _count: { select: { users: true, facilities: true } },
      targets: { select: { year: true } },
    },
  });
  const activityCounts = await prisma.activityData.groupBy({
    by: ["facilityId"],
    _count: true,
  });
  const facOrg = await prisma.facility.findMany({ select: { id: true, orgId: true } });
  const orgActivity = new Map<string, number>();
  for (const a of activityCounts) {
    const orgId = facOrg.find((f) => f.id === a.facilityId)?.orgId;
    if (orgId) orgActivity.set(orgId, (orgActivity.get(orgId) ?? 0) + a._count);
  }

  return (
    <>
      <PageHeader
        eyebrow="platform yönetimi"
        title="Kurumlar"
        desc="Platformda tanımlı tüm kurumlar — üst çubuktan kurum bağlamı değiştirilebilir"
        actions={<KurumEkleButonu />}
      />
      <Card pad={false} className="rise-1">
        <Table
          head={
            <>
              <th>kurum</th>
              <th>ürün</th>
              <th className="text-right">baz yıl</th>
              <th className="text-right">net-sıfır</th>
              <th className="text-right">kullanıcı</th>
              <th className="text-right">tesis</th>
              <th className="text-right">faaliyet kaydı</th>
              <th className="w-16"></th>
            </>
          }
        >
          {orgs.map((o) => (
            <tr key={o.id}>
              <td className="font-semibold">{o.name}</td>
              <td><KurumTuruEtiketi type={o.type} /></td>
              <td className="text-right tabular-nums">{o.baselineYear}</td>
              <td className="text-right tabular-nums">{o.netZeroYear}</td>
              <td className="text-right tabular-nums">{fmtInt(o._count.users)}</td>
              <td className="text-right tabular-nums">{fmtInt(o._count.facilities)}</td>
              <td className="text-right tabular-nums">{fmtInt(orgActivity.get(o.id) ?? 0)}</td>
              <td className="text-right"><KurumSilButonu id={o.id} name={o.name} /></td>
            </tr>
          ))}
        </Table>
      </Card>
      <p className="mt-4 text-[11.5px] text-ink/40">
        Kurum silindiğinde tüm tesisleri, faaliyet verileri, faktörleri, eylem planları ve hedefleri kalıcı olarak silinir.
      </p>
    </>
  );
}
