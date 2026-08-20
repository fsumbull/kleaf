import { getScope } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader, Card, EmptyState } from "@/components/ui";

export default async function UyumRaporuPage() {
  const { org } = await getScope();
  if (org.type !== "KLEAF") return <Card><EmptyState title="Yalnız KLEAF" desc="" /></Card>;

  const orgs = await prisma.organization.findMany({
    where: { type: { in: ["KARBON_BANK", "BELEDIYE", "SANAYI", "KAMU"] } },
    select: {
      id: true, name: true, type: true,
      _count: { select: { complianceFlags: { where: { durum: "ACIK" } } } },
    },
    orderBy: { name: "asc" },
  });

  return (
    <>
      <PageHeader
        eyebrow="denetim otoritesi"
        title="Uyum raporu"
        desc="Kurum bazlı PDF — özet + açık/çözülen bayraklar + karar geçmişi"
      />
      {orgs.length === 0 ? (
        <Card><EmptyState title="İzlenen kurum yok" desc="Sistemde denetlenen bir kurum bulunmuyor." /></Card>
      ) : (
        <Card>
          <div className="overflow-auto">
            <table className="w-full text-[13px]">
              <thead className="text-left text-[11px] uppercase tracking-wide text-ink/50">
                <tr>
                  <th className="p-2">Kurum</th>
                  <th className="p-2">Tip</th>
                  <th className="p-2 text-right">Açık bayrak</th>
                  <th className="p-2 text-right">PDF</th>
                </tr>
              </thead>
              <tbody>
                {orgs.map((o) => (
                  <tr key={o.id} className="border-t border-leaf-200/40">
                    <td className="p-2 font-medium">{o.name}</td>
                    <td className="p-2 text-ink/60">{o.type}</td>
                    <td className="p-2 text-right">
                      <span className={o._count.complianceFlags > 0 ? "font-medium text-red-700" : "text-ink/50"}>
                        {o._count.complianceFlags}
                      </span>
                    </td>
                    <td className="p-2 text-right">
                      <a
                        href={`/api/uyum-raporu?kurum=${o.id}`}
                        className="inline-block rounded-lg border border-leaf-300 bg-white/70 px-2.5 py-1 text-[11.5px] font-medium text-leaf-700 hover:bg-leaf-50"
                        target="_blank"
                        rel="noreferrer"
                      >
                        PDF indir
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </>
  );
}
