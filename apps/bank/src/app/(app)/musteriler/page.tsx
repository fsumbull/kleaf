import { getScope } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader, Card, Table, Badge, KpiCard, EmptyState } from "@/components/ui";
import { fmtTons } from "@/lib/format";

const SEG: Record<string, string> = { BELEDIYE: "belediye", SANAYI: "sanayi", KAMU: "kamu" };
const STATUS: Record<string, string> = { AKTIF: "aktif", BEKLEMEDE: "beklemede", PASIF: "pasif" };
const stTone = (s: string): "leaf" | "warm" | "gray" => (s === "AKTIF" ? "leaf" : s === "BEKLEMEDE" ? "warm" : "gray");
const mn = (v: number) => (v / 1_000_000).toLocaleString("tr-TR", { maximumFractionDigits: 1 });

export default async function MusterilerPage() {
  const { org } = await getScope();
  if (org.type !== "KARBON_BANK") return <Card className="rise-1"><EmptyState title="KarbonBank'a özel sayfa" desc="Belediye paneli: http://localhost:3100" /></Card>;

  const clients = await prisma.clientAccount.findMany({
    where: { bankOrgId: org.id },
    include: { clientOrg: { select: { name: true, type: true } } },
    orderBy: { balanceTCO2e: "desc" },
  });
  const toplamLimit = clients.reduce((a, c) => a + c.creditLimitTRY, 0);
  const toplamBakiye = clients.reduce((a, c) => a + c.balanceTCO2e, 0);
  const aktif = clients.filter((c) => c.status === "AKTIF").length;

  return (
    <>
      <PageHeader eyebrow="ilişki yönetimi" title="Müşteriler" desc={`${org.name} · ${clients.length} müşteri hesabı · ${aktif} aktif`} />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <div className="rise-1"><KpiCard label="toplam müşteri" value={String(clients.length)} hint={`${aktif} aktif`} /></div>
        <div className="rise-2"><KpiCard label="toplam kredi limiti" value={mn(toplamLimit)} unit="mn ₺" /></div>
        <div className="rise-3"><KpiCard label="edinilmiş bakiye" value={fmtTons(toplamBakiye)} unit="tCO₂e" /></div>
      </div>
      <Card className="rise-2">
        <Table head={<>
          <th>müşteri</th><th>segment</th><th>kredi limiti ₺</th><th>bakiye tCO₂e</th><th>durum</th>
        </>}>
          {clients.map((c) => (
            <tr key={c.id}>
              <td className="font-medium text-ink">{c.clientOrg.name}</td>
              <td><Badge tone="gray">{SEG[c.segment] ?? c.segment}</Badge></td>
              <td className="tabular-nums">{c.creditLimitTRY.toLocaleString("tr-TR")}</td>
              <td className="tabular-nums">{fmtTons(c.balanceTCO2e)}</td>
              <td><Badge tone={stTone(c.status)}>{STATUS[c.status] ?? c.status}</Badge></td>
            </tr>
          ))}
        </Table>
      </Card>
    </>
  );
}
