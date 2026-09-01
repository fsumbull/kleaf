import { getScope } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader, Card, CardTitle, EmptyState } from "@/components/ui";
import { COMPLIANCE_FLAG_TYPE_LABELS, COMPLIANCE_SEVERITY_LABELS } from "@/lib/constants";
import { KararForm } from "@/components/karar-form";
import { BelgeTarama } from "@/components/belge-tarama";
import { notFound } from "next/navigation";

export default async function TxDetay({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { org } = await getScope();
  if (org.type !== "KLEAF") return <Card><EmptyState title="Yalnız KLEAF" desc="" /></Card>;

  const tx = await prisma.creditTransaction.findUnique({
    where: { id },
    include: {
      pool: true,
      bankOrg: { select: { id: true, name: true } },
      buyerOrg: { select: { id: true, name: true } },
      complianceFlags: { orderBy: { createdAt: "desc" } },
      auditDecisions: { orderBy: { createdAt: "desc" }, include: {} },
      retirements: { select: { year: true, amountTCO2e: true, createdAt: true } },
    },
  });
  if (!tx) return notFound();

  const acikBayrak = tx.complianceFlags.filter((f) => f.durum === "ACIK");

  return (
    <>
      <PageHeader
        eyebrow="kredi denetimi · işlem detay"
        title={`${tx.pool.projectName} → ${tx.buyerOrg.name}`}
        desc={`${tx.amountTCO2e} tCO₂e · ${tx.priceTRYPerTon} ₺/t · durum: ${tx.status}`}
      />

      <div className="rise-1 grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        <div className="space-y-3">
          <Card>
            <CardTitle>işlem</CardTitle>
            <div className="mt-2 space-y-1 text-[13px]">
              <Row k="Satıcı (banka)" v={tx.bankOrg.name} />
              <Row k="Alıcı" v={tx.buyerOrg.name} />
              <Row k="Havuz" v={`${tx.pool.projectName} · ${tx.pool.standard} · vintage ${tx.pool.vintageYear}`} />
              <Row k="Havuz tipi" v={tx.pool.poolType} />
              <Row k="Miktar" v={`${tx.amountTCO2e.toLocaleString("tr-TR")} tCO₂e`} />
              <Row k="Fiyat" v={`${tx.priceTRYPerTon.toLocaleString("tr-TR")} ₺/t`} />
              <Row k="Toplam" v={`${(tx.amountTCO2e * tx.priceTRYPerTon).toLocaleString("tr-TR")} ₺`} />
              <Row k="Durum" v={tx.status + (tx.askiOncesiStatus ? ` (askı öncesi: ${tx.askiOncesiStatus})` : "")} />
              <Row k="Talep tarihi" v={new Date(tx.createdAt).toLocaleString("tr-TR")} />
            </div>
          </Card>

          <Card>
            <CardTitle>bayraklar ({tx.complianceFlags.length})</CardTitle>
            {tx.complianceFlags.length === 0 ? (
              <p className="mt-2 text-[12.5px] text-ink/50">Bu işlem için bayrak yok.</p>
            ) : (
              <ul className="mt-2 space-y-2">
                {tx.complianceFlags.map((f) => (
                  <li key={f.id} className="rounded-lg border border-leaf-200/40 bg-white/50 px-3 py-2">
                    <div className="mb-1 flex items-center gap-2 text-[12px]">
                      <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-medium ${
                        f.onem === "YUKSEK" ? "bg-red-100 text-red-700" :
                        f.onem === "ORTA" ? "bg-amber-100 text-amber-700" : "bg-white/60 text-ink/60"
                      }`}>{COMPLIANCE_SEVERITY_LABELS[f.onem as keyof typeof COMPLIANCE_SEVERITY_LABELS] ?? f.onem}</span>
                      <span className="font-medium text-ink">{COMPLIANCE_FLAG_TYPE_LABELS[f.tur as keyof typeof COMPLIANCE_FLAG_TYPE_LABELS] ?? f.tur}</span>
                      <span className={`ml-auto rounded-full px-2 py-0.5 text-[10.5px] ${f.durum === "ACIK" ? "bg-red-50 text-red-700" : "bg-leaf-50 text-leaf-700"}`}>{f.durum}</span>
                    </div>
                    <p className="text-[12.5px] text-ink/65">{f.aciklama}</p>
                    {f.cozumNotu && <p className="mt-1 text-[11px] text-ink/45">çözüm notu: {f.cozumNotu}</p>}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-3">
          <Card>
            <CardTitle>karar ver</CardTitle>
            <KararForm txId={tx.id} currentStatus={tx.status} acikBayrakSay={acikBayrak.length} />
          </Card>

          <Card>
            <CardTitle>kanıt belgesi tarama (OCR)</CardTitle>
            <BelgeTarama beklenenMiktar={tx.amountTCO2e} beklenenFiyat={tx.priceTRYPerTon} />
          </Card>

          <Card>
            <CardTitle>karar geçmişi ({tx.auditDecisions.length})</CardTitle>
            {tx.auditDecisions.length === 0 ? (
              <p className="mt-2 text-[12.5px] text-ink/50">Henüz karar yok.</p>
            ) : (
              <ul className="mt-2 space-y-1.5 text-[12px]">
                {tx.auditDecisions.map((d) => (
                  <li key={d.id} className="rounded-lg bg-white/60 px-2.5 py-1.5">
                    <div className="flex items-center gap-2">
                      <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-medium ${
                        d.karar === "ONAY" ? "bg-leaf-100 text-leaf-700" :
                        d.karar === "ASKI" ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700"
                      }`}>{d.karar}</span>
                      <span className="text-ink/50 text-[11px]">{new Date(d.createdAt).toLocaleString("tr-TR")}</span>
                    </div>
                    {d.not && <p className="mt-1 text-ink/65">{d.not}</p>}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2 border-b border-leaf-200/30 pb-1 last:border-0">
      <span className="text-ink/55">{k}</span>
      <span className="text-right font-medium text-ink">{v}</span>
    </div>
  );
}
