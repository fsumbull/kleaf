import { getScope } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader, Card, EmptyState } from "@/components/ui";
import { COMPLIANCE_FLAG_TYPE_LABELS, COMPLIANCE_SEVERITY_LABELS } from "@/lib/constants";
import { BayrakCoz } from "@/components/bayrak-coz";
import { ToplaTara } from "@/components/topla-tara";
import Link from "next/link";

export default async function BayraklarPage() {
  const { org } = await getScope();
  if (org.type !== "KLEAF") return <Card><EmptyState title="Yalnız KLEAF" desc="" /></Card>;

  const [acik, cozulmus] = await Promise.all([
    prisma.complianceFlag.findMany({
      where: { durum: "ACIK" },
      include: { org: { select: { name: true, type: true } } },
      orderBy: [{ onem: "desc" }, { createdAt: "desc" }],
    }),
    prisma.complianceFlag.count({ where: { durum: "COZULDU" } }),
  ]);

  const yuksek = acik.filter((f) => f.onem === "YUKSEK").length;
  const orta = acik.filter((f) => f.onem === "ORTA").length;
  const dusuk = acik.filter((f) => f.onem === "DUSUK").length;

  return (
    <>
      <PageHeader
        eyebrow="uyum motoru"
        title="Uyum bayrakları"
        desc={`${acik.length} açık (${yuksek} yüksek · ${orta} orta · ${dusuk} düşük) · ${cozulmus} çözüldü`}
        actions={<ToplaTara />}
      />
      {acik.length === 0 ? (
        <Card><EmptyState title="Açık bayrak yok" desc="Tüm sinyaller çözülmüş görünüyor." /></Card>
      ) : (
        <div className="space-y-2">
          {acik.map((f) => (
            <Card key={f.id} className="rise-1">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex items-center gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-medium ${
                      f.onem === "YUKSEK" ? "bg-red-100 text-red-700" :
                      f.onem === "ORTA" ? "bg-amber-100 text-amber-700" :
                      "bg-white/60 text-ink/60"
                    }`}>{COMPLIANCE_SEVERITY_LABELS[f.onem as keyof typeof COMPLIANCE_SEVERITY_LABELS] ?? f.onem}</span>
                    <span className="text-[13.5px] font-medium text-ink">{COMPLIANCE_FLAG_TYPE_LABELS[f.tur as keyof typeof COMPLIANCE_FLAG_TYPE_LABELS] ?? f.tur}</span>
                    <span className="text-[11.5px] text-ink/45">{f.org.name}</span>
                    {f.transactionId && (
                      <Link href={`/kredi-denetimi/${f.transactionId}`} className="text-[11px] text-leaf-600 hover:underline">işleme git →</Link>
                    )}
                  </div>
                  <p className="text-[12.5px] text-ink/65">{f.aciklama}</p>
                  <p className="mt-1 text-[10.5px] text-ink/40">{new Date(f.createdAt).toLocaleString("tr-TR")}</p>
                  <BayrakCoz id={f.id} />
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
