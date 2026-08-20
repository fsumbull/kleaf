import { getScope } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader, Card, EmptyState } from "@/components/ui";
import { SubeHarita3D, type SubeCity, type SubeBranch } from "@/components/sube-harita-3d";

export default async function SubeHaritasiPage() {
  const { org } = await getScope();
  if (org.type !== "KARBON_BANK") {
    return <Card className="rise-1"><EmptyState title="Bu sayfa KarbonBank'a özeldir" desc="Belediye paneli için http://localhost:3100" /></Card>;
  }

  const [rows, facilities, records] = await Promise.all([
    prisma.branchCandidate.findMany({
      where: { bankOrgId: org.id, active: true },
      orderBy: { opportunity: "desc" },
    }),
    prisma.facility.findMany({
      where: { orgId: org.id, lat: { not: null }, lng: { not: null } },
      select: { id: true, name: true, type: true, lat: true, lng: true, staffCount: true, areaM2: true },
    }),
    prisma.emissionRecord.findMany({
      where: { activityData: { facility: { orgId: org.id }, year: 2025 } },
      select: { scope: true, tCO2e: true, activityData: { select: { facilityId: true } } },
    }),
  ]);

  const cities: SubeCity[] = rows.map((r) => ({
    city: r.city, lat: r.lat, lng: r.lng, opportunity: Math.round(r.opportunity),
    demandScore: r.demandScore, supplyScore: r.supplyScore, industryScore: r.industryScore,
    population: r.population, status: r.status,
  }));

  // gerçek şube emisyonları — 2025 yıllık toplam (Scope 2 negatif kırpması)
  const perFacility = new Map<string, number>();
  for (const r of records) {
    const t = r.scope === 2 ? Math.max(0, r.tCO2e) : r.tCO2e;
    perFacility.set(r.activityData.facilityId, (perFacility.get(r.activityData.facilityId) ?? 0) + t);
  }
  const branches: SubeBranch[] = facilities.map((f) => {
    const isDC = f.name.toLowerCase().includes("veri merkezi") || f.type === "TESIS";
    const isHQ = f.name.includes("Genel Müdürlük");
    return {
      name: f.name, type: f.type, lat: f.lat!, lng: f.lng!,
      tCO2e: perFacility.get(f.id) ?? 0,
      staff: f.staffCount ?? 0, areaM2: f.areaM2 ?? 0,
      isHQ, isDC: !isHQ && isDC,
    };
  });

  const acilan = cities.filter((c) => c.status === "ACILDI" || c.status === "MERKEZ").length;
  const aday = cities.filter((c) => c.status === "ADAY").length;
  const oncelikli = cities.filter((c) => c.opportunity >= 70 && c.status === "ADAY");

  return (
    <>
      <PageHeader
        eyebrow="operasyon ağı & pazar geliştirme"
        title="Şube haritası"
        desc={`${org.name} · ${branches.length} gerçek şube+DC (ayak izi) · ${aday} aday şehir (fırsat) · katman değiştirici üstte`}
      />
      {oncelikli.length > 0 && (
        <div className="rise mb-5 flex flex-wrap items-center gap-2 rounded-2xl border border-amber-200 bg-amber-50/70 px-4 py-2.5 text-[12.5px] text-warm">
          <b>öncelikli açılım fırsatı:</b>
          {oncelikli.map((c) => (
            <span key={c.city} className="rounded-full bg-white/70 px-2.5 py-0.5 font-medium">{c.city} · {c.opportunity}</span>
          ))}
        </div>
      )}
      {cities.length === 0 && branches.length === 0 ? (
        <Card><EmptyState title="Harita verisi yok" desc="Ne gerçek şube ne aday şehir tanımlanmış." /></Card>
      ) : (
        <>
          <div className="rise mb-4 grid gap-3 sm:grid-cols-3">
            <StatKart label="gerçek nokta (şube + DC)" v={String(branches.length)} sub={`${acilan} şehirde açılmış`} />
            <StatKart label="aday şehir" v={String(aday)} sub={`${oncelikli.length} öncelikli fırsat`} />
            <StatKart label="toplam yıllık ayak izi (2025)" v={fmt(branches.reduce((a, b) => a + b.tCO2e, 0))} sub="tCO₂e · gerçek şubeler" />
          </div>
          <SubeHarita3D cities={cities} branches={branches} />
        </>
      )}
    </>
  );
}

function StatKart({ label, v, sub }: { label: string; v: string; sub: string }) {
  return (
    <div className="rounded-2xl border border-leaf-200/60 bg-white/60 p-3">
      <p className="text-[10.5px] uppercase tracking-wide text-ink/45">{label}</p>
      <p className="mt-0.5 font-brand text-[20px] font-bold text-ink">{v}</p>
      <p className="text-[11px] text-ink/50">{sub}</p>
    </div>
  );
}

function fmt(n: number): string {
  if (n >= 1000) return n.toLocaleString("tr-TR", { maximumFractionDigits: 0 });
  return n.toLocaleString("tr-TR", { maximumFractionDigits: 1 });
}
