import { getScope } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader, Card, EmptyState } from "@/components/ui";
import Link from "next/link";

export default async function KrediDenetimiPage() {
  const { org } = await getScope();
  if (org.type !== "KLEAF") return <Card><EmptyState title="Yalnız KLEAF org tipi" desc="" /></Card>;

  const txs = await prisma.creditTransaction.findMany({
    include: {
      pool: { select: { poolType: true, projectName: true } },
      buyerOrg: { select: { name: true, type: true } },
      bankOrg: { select: { name: true, type: true } },
      complianceFlags: { where: { durum: "ACIK" }, select: { tur: true, onem: true } },
      auditDecisions: { orderBy: { createdAt: "desc" }, take: 1, select: { karar: true, createdAt: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  const askiSay = txs.filter((t) => t.status === "DENETIM_ASKI").length;
  const bayrakli = txs.filter((t) => t.complianceFlags.length > 0).length;

  return (
    <>
      <PageHeader
        eyebrow="karbon kredi işlemleri"
        title="Kredi denetimi"
        desc={`son ${txs.length} işlem · ${askiSay} askıda · ${bayrakli} açık bayraklı`}
      />
      {txs.length === 0 ? (
        <Card><EmptyState title="Kayıt yok" desc="Henüz kredi işlemi bulunmuyor." /></Card>
      ) : (
        <Card>
          <div className="overflow-auto">
            <table className="w-full text-[12.5px]">
              <thead className="text-left text-[11px] uppercase tracking-wide text-ink/50">
                <tr>
                  <th className="p-2">Tarih</th>
                  <th className="p-2">Satıcı → Alıcı</th>
                  <th className="p-2">Havuz</th>
                  <th className="p-2 text-right">tCO₂e</th>
                  <th className="p-2 text-right">₺/t</th>
                  <th className="p-2">Durum</th>
                  <th className="p-2">Bayrak</th>
                  <th className="p-2">Aksiyon</th>
                </tr>
              </thead>
              <tbody>
                {txs.map((t) => (
                  <tr key={t.id} className="border-t border-leaf-200/40">
                    <td className="p-2 text-ink/60">{new Date(t.createdAt).toLocaleDateString("tr-TR")}</td>
                    <td className="p-2">
                      <span className="text-ink/70">{t.bankOrg?.name ?? "-"}</span>
                      <span className="mx-1 text-ink/30">→</span>
                      <span>{t.buyerOrg?.name ?? "-"}</span>
                    </td>
                    <td className="p-2 text-ink/60">{t.pool?.projectName ?? "-"} <span className="ml-1 text-[10.5px] text-ink/40">{t.pool?.poolType}</span></td>
                    <td className="p-2 text-right font-medium">{t.amountTCO2e.toLocaleString("tr-TR")}</td>
                    <td className="p-2 text-right text-ink/60">{t.priceTRYPerTon.toLocaleString("tr-TR")}</td>
                    <td className="p-2">
                      <span className={`rounded-full px-2 py-0.5 text-[10.5px] ${
                        t.status === "DENETIM_ASKI" ? "bg-amber-100 text-amber-700" :
                        t.status === "TRANSFER" ? "bg-leaf-100 text-leaf-700" :
                        "bg-white/60 text-ink/60"
                      }`}>{t.status}</span>
                    </td>
                    <td className="p-2">
                      {t.complianceFlags.length > 0 ? (
                        <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10.5px] font-medium text-red-700">
                          {t.complianceFlags.length} bayrak
                        </span>
                      ) : (
                        <span className="text-ink/30">—</span>
                      )}
                    </td>
                    <td className="p-2">
                      <Link href={`/kredi-denetimi/${t.id}`} className="text-leaf-600 hover:underline">incele</Link>
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
