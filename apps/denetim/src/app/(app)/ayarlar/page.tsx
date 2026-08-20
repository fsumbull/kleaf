import { getScope, requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui";
import { KurumAyarFormu, HedefTablosu } from "@/components/ayarlar-client";

export default async function AyarlarPage() {
  await requireSession(["SUPER_ADMIN", "IKLIM_MERKEZI"]);
  const { org } = await getScope();

  const [targets, orgRow] = await Promise.all([
    prisma.target.findMany({
      where: { orgId: org.id },
      orderBy: { year: "asc" },
      select: { year: true, targetTCO2e: true },
    }),
    prisma.organization.findUniqueOrThrow({
      where: { id: org.id },
      select: {
        elektrikTRYPerKwh: true, dogalgazTRYPerM3: true, dizelTRYPerL: true,
        atikBertarafTRYPerTon: true, enerjiTasarrufHedefiPct: true,
        gesKwhPerKwp: true, gesCapexTRYPerKwp: true, portalAcik: true,
      },
    }),
  ]);

  // baz yıldan +10 yıla kadar düzenlenebilir hedef aralığı
  const years = Array.from({ length: 11 }, (_, i) => org.baselineYear + i);

  return (
    <>
      <PageHeader
        eyebrow="ayarlar"
        title="Kurum ayarları"
        desc={`${org.name} · envanter referansları ve yıllık azaltım hedefleri`}
      />
      <div className="grid gap-4 xl:grid-cols-[380px_1fr]">
        <KurumAyarFormu
          orgId={org.id}
          baselineYear={org.baselineYear}
          netZeroYear={org.netZeroYear}
          portalAcik={orgRow.portalAcik}
          prices={orgRow}
        />
        <HedefTablosu orgId={org.id} targets={targets} years={years} />
      </div>
    </>
  );
}
