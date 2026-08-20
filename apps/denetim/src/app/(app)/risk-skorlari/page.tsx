import { getScope } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader, Card, CardTitle, Table, Badge, EmptyState } from "@/components/ui";
import { hesaplaRiskPuan, KADEME_ETIKET, type RiskKademe } from "@/lib/risk";

export const dynamic = "force-dynamic";

export default async function RiskSkorlariPage() {
  const { org } = await getScope();
  if (org.type !== "KLEAF") return <Card><EmptyState title="Yalnız KLEAF denetçisi" desc="" /></Card>;

  const orgs = await prisma.organization.findMany({
    where: { type: { in: ["KARBON_BANK", "BELEDIYE", "SANAYI", "KAMU"] } },
    select: { id: true, name: true, type: true },
    orderBy: { name: "asc" },
  });

  const [bayraklar, kararlar] = await Promise.all([
    prisma.complianceFlag.groupBy({
      by: ["orgId", "durum"],
      _count: { _all: true },
    }),
    prisma.auditDecision.findMany({
      where: { karar: { in: ["ASKI", "ITIRAZ"] } },
      select: {
        karar: true,
        transaction: { select: { buyerOrgId: true, bankOrgId: true } },
      },
    }),
  ]);

  const bayrakAcik = new Map<string, number>();
  const bayrakCozulmus = new Map<string, number>();
  for (const b of bayraklar) {
    if (b.durum === "ACIK") bayrakAcik.set(b.orgId, (bayrakAcik.get(b.orgId) ?? 0) + b._count._all);
    if (b.durum === "COZULDU") bayrakCozulmus.set(b.orgId, (bayrakCozulmus.get(b.orgId) ?? 0) + b._count._all);
  }
  const redSay = new Map<string, number>();
  for (const k of kararlar) {
    // hem alıcı hem banka için say
    redSay.set(k.transaction.buyerOrgId, (redSay.get(k.transaction.buyerOrgId) ?? 0) + 1);
    redSay.set(k.transaction.bankOrgId, (redSay.get(k.transaction.bankOrgId) ?? 0) + 1);
  }

  // Gecikme proxy: çözülmüş bayrak sayısı (geçmiş uyum gecikmesi göstergesi)
  const skorlar = orgs.map((o) => {
    const bayrakSay = bayrakAcik.get(o.id) ?? 0;
    const gecikmeAy = bayrakCozulmus.get(o.id) ?? 0; // geçmişteki gecikme proxy'si
    const red = redSay.get(o.id) ?? 0;
    const risk = hesaplaRiskPuan({ bayrakSay, gecikmeAy, redSay: red });
    return { ...o, ...risk, bayrakSay, gecikmeAy, red };
  }).sort((a, b) => b.puan - a.puan);

  const kademeSay: Record<RiskKademe, number> = { A: 0, B: 0, C: 0, D: 0, E: 0 };
  for (const s of skorlar) kademeSay[s.kademe]++;

  return (
    <>
      <PageHeader
        eyebrow="risk skorları"
        title="Kurum risk kademe matrisi"
        desc="deterministik heuristik · bayrak×3 + gecikme×2 + red×5 → A/B/C/D/E"
      />

      <div className="rise mb-5 grid gap-2 sm:grid-cols-5">
        {(["A", "B", "C", "D", "E"] as RiskKademe[]).map((k) => (
          <div key={k} className="glass p-4 text-center">
            <p className="text-[11px] lowercase tracking-[0.1em] text-ink/55">{KADEME_ETIKET[k].aciklama.split(" — ")[0]}</p>
            <p className={`mt-2 text-[32px] font-bold leading-none ${
              KADEME_ETIKET[k].renk === "leaf" ? "text-leaf-600" :
              KADEME_ETIKET[k].renk === "warm" ? "text-warm" : "text-danger"
            }`}>{k}</p>
            <p className="mt-1 text-[12px] text-ink/60">{kademeSay[k]} kurum</p>
          </div>
        ))}
      </div>

      <Card>
        <CardTitle>Kurum sıralaması (puan büyükten küçüğe)</CardTitle>
        <Table head={["Kurum", "Tip", "Kademe", "Puan", "Bayrak (açık)", "Çözülmüş bayrak", "Red kararı", "Detay"]}>
          {skorlar.map((s) => (
            <tr key={s.id}>
              <td className="p-2">{s.name}</td>
              <td className="p-2 lowercase">{s.type.toLowerCase().replace("_", " ")}</td>
              <td className="p-2">
                <Badge tone={KADEME_ETIKET[s.kademe].renk === "leaf" ? "leaf" : KADEME_ETIKET[s.kademe].renk === "warm" ? "warm" : "danger"}>
                  {s.kademe}
                </Badge>
              </td>
              <td className="p-2 text-right tabular-nums font-medium">{s.puan}</td>
              <td className="p-2 text-right tabular-nums">{s.bayrakSay}</td>
              <td className="p-2 text-right tabular-nums">{s.gecikmeAy}</td>
              <td className="p-2 text-right tabular-nums">{s.red}</td>
              <td className="p-2 text-[11.5px] text-ink/55">{s.detay}</td>
            </tr>
          ))}
        </Table>
      </Card>

      <div className="mt-4 grid gap-2 sm:grid-cols-5">
        {(["A", "B", "C", "D", "E"] as RiskKademe[]).map((k) => (
          <div key={k} className="glass p-3 text-[11.5px]">
            <p className="mb-1 font-medium text-ink/70">{k} · {KADEME_ETIKET[k].aciklama}</p>
            <p className="text-ink/50">
              puan aralığı: {k === "A" ? "0–9" : k === "B" ? "10–19" : k === "C" ? "20–34" : k === "D" ? "35–54" : "55+"}
            </p>
          </div>
        ))}
      </div>
    </>
  );
}
