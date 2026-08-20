/* KarbonBank — havuz portföyü, bekleyen talepler, işlem geçmişi (banka kurumu) */
import { redirect } from "next/navigation";
import { getScope } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { BANKA_YONETIM_ROLLER } from "@/lib/yetki";
import { fmt1 } from "@/lib/format";
import { PageHeader, KpiCard, Card, CardTitle, EmptyState } from "@/components/ui";
import { BankaPaneli, HavuzEkleButonu } from "@/components/banka-client";

export default async function BankaPage() {
  const { session, org } = await getScope();
  if (org.type !== "KARBON_BANK") redirect("/");
  const canManage = (BANKA_YONETIM_ROLLER as readonly string[]).includes(session.role);

  const [pools, txs] = await Promise.all([
    prisma.creditPool.findMany({
      where: { bankOrgId: org.id },
      orderBy: [{ active: "desc" }, { createdAt: "desc" }],
    }),
    prisma.creditTransaction.findMany({
      where: { bankOrgId: org.id },
      include: {
        pool: { select: { projectName: true, standard: true, vintageYear: true, availableTCO2e: true } },
        buyerOrg: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
  ]);

  const aktifKapasite = pools.filter((p) => p.active).reduce((a, p) => a + p.availableTCO2e, 0);
  const transferler = txs.filter((t) => t.status === "TRANSFER");
  const satilan = transferler.reduce((a, t) => a + t.amountTCO2e, 0);
  const ciro = transferler.reduce((a, t) => a + t.amountTCO2e * t.priceTRYPerTon, 0);
  const bekleyen = txs.filter((t) => t.status === "TALEP").length;

  const poolDto = pools.map((p) => ({
    id: p.id, projectName: p.projectName, standard: p.standard, vintageYear: p.vintageYear,
    totalTCO2e: p.totalTCO2e, availableTCO2e: p.availableTCO2e, priceTRYPerTon: p.priceTRYPerTon, active: p.active,
  }));
  const txDto = txs.map((t) => ({
    id: t.id, status: t.status, amountTCO2e: t.amountTCO2e, priceTRYPerTon: t.priceTRYPerTon,
    requestNote: t.requestNote, decisionNote: t.decisionNote,
    createdAt: t.createdAt.toISOString(),
    pool: { projectName: t.pool.projectName, standard: t.pool.standard, vintageYear: t.pool.vintageYear, availableTCO2e: t.pool.availableTCO2e },
    buyerOrg: t.buyerOrg.name,
  }));

  return (
    <>
      <PageHeader
        eyebrow="karbonbank"
        title="Kredi portföyü"
        desc={`${org.name} · havuz yönetimi, talep onayı ve transfer izleme`}
        actions={canManage ? <HavuzEkleButonu /> : undefined}
      />
      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="satışa açık kredi" value={fmt1(aktifKapasite)} unit="tCO₂e" hint={`${pools.filter((p) => p.active).length} aktif havuz`} />
        <KpiCard label="transfer edilen" value={fmt1(satilan)} unit="tCO₂e" hint={`${transferler.length} işlem`} />
        <KpiCard label="toplam ciro" value={fmt1(ciro / 1000)} unit="bin ₺" hint="tamamlanan transferler" tone="warm" />
        <KpiCard label="bekleyen talep" value={String(bekleyen)} hint={bekleyen ? "karar bekliyor" : "kuyruk boş"} />
      </div>
      {pools.length === 0 ? (
        <Card className="rise-1">
          <CardTitle>havuzlar</CardTitle>
          <EmptyState
            title="Henüz kredi havuzu yok"
            desc="Sertifikalı projelerinizi havuz olarak ekleyin — belediyeler vitrinde görüp talep oluşturur."
            action={canManage ? <HavuzEkleButonu birincil /> : undefined}
          />
        </Card>
      ) : (
        <BankaPaneli pools={poolDto} islemler={txDto} canManage={canManage} />
      )}
    </>
  );
}
