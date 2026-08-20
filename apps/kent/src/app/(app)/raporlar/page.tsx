import { getScope } from "@/lib/auth";
import { getEmissionRows } from "@/lib/data";
import { yearScopeTotals } from "@/lib/carbon/engine";
import { prisma } from "@/lib/prisma";
import { PageHeader, Card, Badge } from "@/components/ui";
import { RaporKartlari } from "@/components/raporlar-client";
import { fmtTons, fmtInt } from "@/lib/format";

export default async function RaporlarPage() {
  const { org, year, birim } = await getScope();
  const bu = birim.unitId;
  const rows = await getEmissionRows(org.id, bu);
  const totals = yearScopeTotals(rows, year);
  const recordCount = rows.filter((r) => r.year === year).length;
  const [pending, tesisler] = await Promise.all([
    prisma.activityData.count({
      where: { facility: { orgId: org.id, ...(bu ? { unitId: bu } : {}) }, year, status: "TASLAK" },
    }),
    prisma.facility.findMany({
      where: { orgId: org.id, ...(bu ? { unitId: bu } : {}) },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <>
      <PageHeader
        eyebrow="raporlar"
        title="Raporlar ve dışa aktarım"
        desc={`${org.name} · ${year} raporlama yılı — indirilen dosyalar paneldeki hesaplarla birebir aynı motoru kullanır`}
      />

      <Card className="rise-1 mb-4">
        <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
          <div>
            <div className="eyebrow">rapor kapsamı</div>
            <div className="mt-1 text-[15px] font-bold">{year} yılı · {org.name}</div>
          </div>
          <div className="text-[13px] text-ink/60">
            <span className="font-semibold text-ink">{fmtTons(totals.total)} tCO₂e</span> toplam ·{" "}
            <span className="font-semibold text-ink">{fmtInt(recordCount)}</span> onaylı kayıt
          </div>
          {pending > 0 && (
            <Badge tone="warm">{pending} taslak kayıt rapora dahil edilmez</Badge>
          )}
          <div className="ml-auto text-[11.5px] text-ink/40">
            yıl seçimini üst çubuktan değiştirebilirsiniz
          </div>
        </div>
      </Card>

      <RaporKartlari year={year} tesisler={tesisler} belediye={org.type === "BELEDIYE"} />

      <p className="mt-5 text-[11.5px] leading-relaxed text-ink/40">
        Raporlar, onay anında dondurulan faktör anlık görüntüleriyle hesaplanan kayıtlardan üretilir; sonradan
        değiştirilen faktörler geçmiş raporları etkilemez. PDF raporu ISO 14064-1 ve GHG Protokolü ilkeleriyle uyumlu
        yapıdadır.
      </p>
    </>
  );
}
