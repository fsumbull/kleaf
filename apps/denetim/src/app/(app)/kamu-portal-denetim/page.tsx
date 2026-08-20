import { getScope } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader, Card, CardTitle, KpiCard, Table, Badge, EmptyState } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function KamuPortalDenetimPage() {
  const { org } = await getScope();
  if (org.type !== "KLEAF") return <Card><EmptyState title="Yalnız KLEAF denetçisi" desc="" /></Card>;

  const belediyeler = await prisma.organization.findMany({
    where: { type: "BELEDIYE" },
    select: {
      id: true, name: true, portalAcik: true,
      netZeroYear: true,
      // İç toplam: kendi emisyon kayıtları
      facilities: {
        select: {
          activityData: {
            select: { emissionRecord: { select: { tCO2e: true } } },
          },
        },
      },
    },
    orderBy: { name: "asc" },
  });

  // İç toplam hesabı
  const veriler = belediyeler.map((b) => {
    let ic_toplam = 0;
    let kayit_say = 0;
    for (const f of b.facilities) {
      for (const a of f.activityData) {
        if (a.emissionRecord) {
          ic_toplam += a.emissionRecord.tCO2e;
          kayit_say++;
        }
      }
    }
    // Portal beyanı simülasyonu — portalAcik olanlar için iç_toplam × [0.94 – 1.06] varyasyonu
    // (gerçek portalda çekilecek; şimdilik iç toplam × sabit oran)
    const portal_toplam = b.portalAcik ? ic_toplam * (0.96 + ((b.id.charCodeAt(0) % 10) / 100)) : 0;
    const sapmaPct = b.portalAcik && ic_toplam > 0 ? ((portal_toplam - ic_toplam) / ic_toplam) * 100 : null;
    return {
      id: b.id, name: b.name, portalAcik: b.portalAcik, netZeroYear: b.netZeroYear,
      kayit_say, ic_toplam, portal_toplam, sapmaPct,
    };
  });

  const acikSay = veriler.filter((v) => v.portalAcik).length;
  const sapmaVar = veriler.filter((v) => v.sapmaPct !== null && Math.abs(v.sapmaPct) >= 3).length;
  const ortSapma = (() => {
    const s = veriler.filter((v) => v.sapmaPct !== null).map((v) => Math.abs(v.sapmaPct as number));
    return s.length > 0 ? s.reduce((a, b) => a + b, 0) / s.length : 0;
  })();

  return (
    <>
      <PageHeader
        eyebrow="kamu portal denetimi"
        title="Şeffaflık portalı veri doğruluğu"
        desc={`${belediyeler.length} belediye · ${acikSay} portal açık · %${ortSapma.toFixed(1)} ortalama sapma`}
      />

      <div className="rise mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="portal açık" value={`${acikSay} / ${belediyeler.length}`} hint="şeffaflık taahhüdü veren belediye" tone={acikSay > 0 ? "leaf" : "warm"} />
        <KpiCard label="≥ %3 sapma" value={String(sapmaVar)} hint="portal ↔ iç veri farkı" tone={sapmaVar > 0 ? "warm" : "leaf"} />
        <KpiCard label="ortalama sapma" value={ortSapma.toFixed(1)} unit="%" hint="tüm açık portaller" tone={ortSapma > 5 ? "warm" : "leaf"} />
        <KpiCard label="portal kapalı" value={String(belediyeler.length - acikSay)} hint="şeffaflık için hedeflenmeli" tone={belediyeler.length - acikSay > 0 ? "warm" : "leaf"} />
      </div>

      <Card>
        <CardTitle>Belediye portal denetimi</CardTitle>
        <Table head={["Belediye", "Portal", "İç toplam (ktCO₂e)", "Portal toplam (ktCO₂e)", "Sapma", "Net-sıfır", "Kayıt"]} dense>
          {veriler.map((v) => (
            <tr key={v.id}>
              <td className="p-2">{v.name}</td>
              <td className="p-2">{v.portalAcik ? <Badge tone="leaf">açık</Badge> : <Badge tone="gray">kapalı</Badge>}</td>
              <td className="p-2 text-right tabular-nums">{(v.ic_toplam / 1000).toLocaleString("tr-TR", { maximumFractionDigits: 1 })}</td>
              <td className="p-2 text-right tabular-nums">{v.portalAcik ? (v.portal_toplam / 1000).toLocaleString("tr-TR", { maximumFractionDigits: 1 }) : "—"}</td>
              <td className="p-2 text-right tabular-nums">
                {v.sapmaPct === null ? "—" : (
                  <Badge tone={Math.abs(v.sapmaPct) >= 5 ? "danger" : Math.abs(v.sapmaPct) >= 3 ? "warm" : "leaf"}>
                    {v.sapmaPct > 0 ? "+" : ""}{v.sapmaPct.toFixed(2)}%
                  </Badge>
                )}
              </td>
              <td className="p-2 text-right tabular-nums">{v.netZeroYear ?? "—"}</td>
              <td className="p-2 text-right tabular-nums text-ink/60">{v.kayit_say.toLocaleString("tr-TR")}</td>
            </tr>
          ))}
        </Table>
        <p className="mt-3 text-[11px] text-ink/45">
          portal toplamı üretim aşamasında kamu şeffaflık API&apos;sinden çekilir. Bu görünümde iç veriden simülasyon yapılıyor.
        </p>
      </Card>

      <div className="mt-4">
        <Card>
          <CardTitle>Şeffaflık önerileri</CardTitle>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-ink/8 bg-white/40 p-3 text-[12.5px]">
              <p className="mb-1 font-medium text-ink/75">Portal kapalı belediyeler</p>
              <p className="text-ink/60">
                {veriler.filter((v) => !v.portalAcik).map((v) => v.name).join(", ") || "yok"}
              </p>
            </div>
            <div className="rounded-lg border border-ink/8 bg-white/40 p-3 text-[12.5px]">
              <p className="mb-1 font-medium text-ink/75">Net-sıfır ilan etmemiş belediyeler</p>
              <p className="text-ink/60">
                {veriler.filter((v) => !v.netZeroYear).map((v) => v.name).join(", ") || "yok"}
              </p>
            </div>
          </div>
        </Card>
      </div>
    </>
  );
}
