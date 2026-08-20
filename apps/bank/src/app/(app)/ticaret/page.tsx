import { getScope } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader, Card, CardTitle, Table, Badge, KpiCard, EmptyState } from "@/components/ui";
import { fmtTons } from "@/lib/format";

const STD: Record<string, string> = { GOLD_STANDARD: "Gold Standard", VCS: "Verra VCS", ULUSAL: "ulusal", CDM: "CDM", ACR: "ACR" };
const STATUS: Record<string, string> = { ACIK: "açık", ESLESTI: "eşleşti", IPTAL: "iptal" };
const stTone = (s: string): "leaf" | "warm" | "gray" => (s === "ACIK" ? "leaf" : s === "ESLESTI" ? "warm" : "gray");
const bin = (v: number) => (v / 1000).toLocaleString("tr-TR", { maximumFractionDigits: 0 });

export default async function TicaretPage() {
  const { org } = await getScope();
  if (org.type !== "KARBON_BANK") return <Card className="rise-1"><EmptyState title="KarbonBank'a özel sayfa" desc="Belediye paneli: http://localhost:3100" /></Card>;

  const orders = await prisma.tradeOrder.findMany({ where: { bankOrgId: org.id }, orderBy: { createdAt: "desc" } });
  const allar = orders.filter((o) => o.side === "AL" && o.status === "ACIK");
  const satlar = orders.filter((o) => o.side === "SAT" && o.status === "ACIK");
  const acikAl = allar.reduce((a, o) => a + o.amountTCO2e, 0);
  const acikSat = satlar.reduce((a, o) => a + o.amountTCO2e, 0);
  const acikDeger = orders.filter((o) => o.status === "ACIK").reduce((a, o) => a + o.amountTCO2e * o.priceTRYPerTon, 0);

  return (
    <>
      <PageHeader eyebrow="ticaret masası" title="Order book" desc={`${org.name} · açık alım/satım emirleri ve eşleşmeler`} />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <div className="rise-1"><KpiCard label="açık satım" value={fmtTons(acikSat)} unit="tCO₂e" hint={`${satlar.length} emir`} /></div>
        <div className="rise-2"><KpiCard label="açık alım" value={fmtTons(acikAl)} unit="tCO₂e" hint={`${allar.length} emir`} tone="warm" /></div>
        <div className="rise-3"><KpiCard label="açık emir değeri" value={bin(acikDeger)} unit="bin ₺" hint="miktar × fiyat" /></div>
      </div>
      <Card className="rise-2">
        <CardTitle>emir defteri</CardTitle>
        <Table head={<>
          <th>yön</th><th>standart</th><th>vintage</th><th>miktar</th><th>fiyat ₺/t</th><th>tutar ₺</th><th>karşı taraf</th><th>durum</th>
        </>}>
          {orders.map((o) => (
            <tr key={o.id}>
              <td><Badge tone={o.side === "AL" ? "warm" : "leaf"}>{o.side === "AL" ? "alım" : "satım"}</Badge></td>
              <td>{STD[o.standard] ?? o.standard}</td>
              <td>{o.vintageYear}</td>
              <td className="tabular-nums">{fmtTons(o.amountTCO2e)}</td>
              <td className="tabular-nums">{o.priceTRYPerTon.toLocaleString("tr-TR")}</td>
              <td className="tabular-nums text-ink/70">{(o.amountTCO2e * o.priceTRYPerTon).toLocaleString("tr-TR", { maximumFractionDigits: 0 })}</td>
              <td className="text-ink/60">{o.counterparty ?? "—"}</td>
              <td><Badge tone={stTone(o.status)}>{STATUS[o.status] ?? o.status}</Badge></td>
            </tr>
          ))}
        </Table>
      </Card>
    </>
  );
}
