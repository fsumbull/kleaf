/* CBS emisyon haritası — tesis emisyonları ve mahalle yoğunlukları */
import { getScope } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader, Card } from "@/components/ui";
import { HaritaWrap } from "@/components/harita-wrap";

export default async function HaritaPage() {
  const { org, year, birim } = await getScope();
  const bu = birim.unitId;

  const [facilities, neighborhoods, cityRows] = await Promise.all([
    prisma.facility.findMany({
      where: { orgId: org.id, lat: { not: null }, lng: { not: null }, ...(bu ? { unitId: bu } : {}) },
      select: {
        id: true, name: true, type: true, lat: true, lng: true,
        activityData: {
          where: { year, status: "ONAYLI" },
          select: { emissionRecord: { select: { tCO2e: true } } },
        },
      },
    }),
    prisma.neighborhood.findMany({
      where: { orgId: org.id, lat: { not: null }, lng: { not: null } },
      select: { name: true, population: true, lat: true, lng: true },
    }),
    prisma.cityActivity.aggregate({
      where: { orgId: org.id, year: { lte: year } },
      _sum: { amount: true },
    }),
  ]);

  const tesisler = facilities.map((f) => ({
    id: f.id, name: f.name, type: f.type, lat: f.lat!, lng: f.lng!,
    tCO2e: f.activityData.reduce((s, a) => s + (a.emissionRecord?.tCO2e ?? 0), 0),
  }));

  /* kent envanteri yoksa mahalle emisyonu nüfus oranıyla kurum toplamından pay edilir (gösterim amaçlı) */
  const orgTotal = tesisler.reduce((s, t) => s + Math.max(0, t.tCO2e), 0);
  const totalPop = neighborhoods.reduce((s, n) => s + n.population, 0) || 1;
  const kentCarpan = cityRows._sum.amount ? 4 : 3; // kent ölçeği kurumsalın katı (kaba tahmin)
  const mahalleler = neighborhoods.map((n) => ({
    name: n.name, population: n.population, lat: n.lat!, lng: n.lng!,
    tCO2e: (orgTotal * kentCarpan * n.population) / totalPop,
  }));

  return (
    <>
      <PageHeader
        eyebrow="cbs"
        title="Emisyon haritası"
        desc={`${org.name} · ${year} tesis emisyonları (mavi/yeşil işaretçi) ve mahalle yoğunluk tahminleri (renkli alanlar)`}
      />
      <Card className="rise-1" pad={false}>
        <div className="p-2">
          <HaritaWrap tesisler={tesisler} mahalleler={mahalleler} />
        </div>
      </Card>
      <p className="mt-4 text-[11.5px] text-ink/40">
        Harita altlığı: OpenStreetMap. Mahalle değerleri nüfus ağırlıklı tahmindir; tesis işaretçileri onaylı envanterden gelir. Yeşil işaretçi net mahsup (GES/rüzgar) gösterir.
      </p>
    </>
  );
}
