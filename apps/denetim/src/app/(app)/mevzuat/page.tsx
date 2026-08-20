import { getScope } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader, Card, CardTitle, KpiCard, Table, Badge, EmptyState } from "@/components/ui";

export const dynamic = "force-dynamic";

type Yukumluluk = {
  ad: string;
  kaynak: string;
  sonTarih: string; // ISO YYYY-MM-DD
  frekans: "yıllık" | "3 yılda bir" | "çeyrekli";
  hedef: "belediye" | "banka" | "her ikisi";
  durum: "aktif" | "yaklaşıyor" | "gecikti";
};

// Yönetmelik + gönüllü çerçeve takvimi (sabit — mevzuat kaynağı)
const YUKUMLULUKLER: Yukumluluk[] = [
  { ad: "SEDR yıllık envanter beyanı",       kaynak: "T.C. Çevre, Şehircilik ve İklim Değişikliği Bakanlığı",           sonTarih: "2026-03-31", frekans: "yıllık",       hedef: "belediye",   durum: "yaklaşıyor" },
  { ad: "İklim Değişikliği Uyum Planı",      kaynak: "MİA — Belediye İklim Kanunu",                                     sonTarih: "2026-06-30", frekans: "3 yılda bir", hedef: "belediye",   durum: "aktif" },
  { ad: "CDP Cities açıklaması (gönüllü)",   kaynak: "CDP Worldwide",                                                    sonTarih: "2026-07-31", frekans: "yıllık",       hedef: "belediye",   durum: "aktif" },
  { ad: "GCoM İki Yıllık raporlama",         kaynak: "Global Covenant of Mayors for Climate & Energy",                   sonTarih: "2026-05-15", frekans: "yıllık",       hedef: "belediye",   durum: "yaklaşıyor" },
  { ad: "TCFD uyumlu iklim risk raporu",     kaynak: "SPK — Sürdürülebilirlik İlkeleri Uyum Çerçevesi",                  sonTarih: "2026-04-30", frekans: "yıllık",       hedef: "banka",      durum: "yaklaşıyor" },
  { ad: "ISSB S1/S2 taslak beyanı",          kaynak: "IFRS Foundation",                                                   sonTarih: "2026-08-31", frekans: "yıllık",       hedef: "banka",      durum: "aktif" },
  { ad: "PCAF finansal emisyon envanteri",   kaynak: "Partnership for Carbon Accounting Financials",                     sonTarih: "2026-06-15", frekans: "yıllık",       hedef: "banka",      durum: "aktif" },
  { ad: "SBTi ara hedef güncellemesi",       kaynak: "Science Based Targets initiative",                                  sonTarih: "2027-01-31", frekans: "3 yılda bir", hedef: "her ikisi",  durum: "aktif" },
  { ad: "AB SKDM (CBAM) veri girişi",        kaynak: "EU Commission — Carbon Border Adjustment Mechanism",               sonTarih: "2026-01-31", frekans: "çeyrekli",     hedef: "her ikisi",  durum: "yaklaşıyor" },
  { ad: "Sıfır Emisyonlu Belediye Bildirim", kaynak: "T.C. Çevre Bakanlığı — Gönüllü Karbon Piyasası Yönetmeliği taslağı", sonTarih: "2026-09-30", frekans: "yıllık",       hedef: "belediye",   durum: "aktif" },
];

export default async function MevzuatPage() {
  const { org } = await getScope();
  if (org.type !== "KLEAF") return <Card><EmptyState title="Yalnız KLEAF denetçisi" desc="" /></Card>;

  const belediyeler = await prisma.organization.findMany({
    where: { type: "BELEDIYE" },
    select: { id: true, name: true, netZeroYear: true, portalAcik: true },
    orderBy: { name: "asc" },
  });

  const bankalar = await prisma.organization.findMany({
    where: { type: "KARBON_BANK" },
    select: { id: true, name: true, netZeroYear: true },
    orderBy: { name: "asc" },
  });

  // Yaklaşan (30–90 gün) & gecikmiş yükümlülükleri hesapla
  const bugun = new Date();
  const gunFark = (iso: string) => Math.floor((new Date(iso).getTime() - bugun.getTime()) / 86_400_000);
  const takvim = YUKUMLULUKLER.map((y) => ({ ...y, gun: gunFark(y.sonTarih) })).sort((a, b) => a.gun - b.gun);

  const yaklasan = takvim.filter((y) => y.gun >= 0 && y.gun <= 90).length;
  const gecikti = takvim.filter((y) => y.gun < 0).length;

  const belNet = belediyeler.filter((b) => b.netZeroYear).length;
  const bnkNet = bankalar.filter((b) => b.netZeroYear).length;

  return (
    <>
      <PageHeader
        eyebrow="mevzuat & bildirim"
        title="Raporlama takvimi & net-sıfır matrisi"
        desc={`${YUKUMLULUKLER.length} yükümlülük · ${yaklasan} yaklaşan · ${gecikti} gecikti`}
      />

      <div className="rise mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="aktif yükümlülük" value={String(YUKUMLULUKLER.length)} hint="ulusal + gönüllü çerçeve" tone="leaf" />
        <KpiCard label="≤ 90 gün" value={String(yaklasan)} hint="yaklaşan son tarih" tone={yaklasan > 0 ? "warm" : "leaf"} />
        <KpiCard label="gecikmiş" value={String(gecikti)} hint="son tarih aşıldı" tone={gecikti > 0 ? "danger" : "leaf"} />
        <KpiCard label="net-sıfır ilanı" value={`${belNet + bnkNet}`} hint={`${belNet} belediye · ${bnkNet} banka`} tone="leaf" />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card>
            <CardTitle>Raporlama takvimi (yaklaşan sırayla)</CardTitle>
            <Table head={["Yükümlülük", "Hedef", "Son tarih", "Kalan", "Frekans", "Durum"]} dense>
              {takvim.map((y) => (
                <tr key={y.ad}>
                  <td className="p-2">
                    <div className="text-[13px] font-medium">{y.ad}</div>
                    <div className="text-[11px] text-ink/50">{y.kaynak}</div>
                  </td>
                  <td className="p-2 lowercase">{y.hedef}</td>
                  <td className="p-2 text-[11.5px] text-ink/60">{y.sonTarih}</td>
                  <td className="p-2 text-right tabular-nums">
                    {y.gun < 0 ? (
                      <Badge tone="danger">{Math.abs(y.gun)} gün gecikti</Badge>
                    ) : y.gun <= 30 ? (
                      <Badge tone="warm">{y.gun} gün</Badge>
                    ) : y.gun <= 90 ? (
                      <Badge tone="warm">{y.gun} gün</Badge>
                    ) : (
                      <span className="text-ink/60">{y.gun} gün</span>
                    )}
                  </td>
                  <td className="p-2 text-[11.5px] lowercase text-ink/60">{y.frekans}</td>
                  <td className="p-2"><Badge tone={y.durum === "gecikti" ? "danger" : y.durum === "yaklaşıyor" ? "warm" : "leaf"}>{y.durum}</Badge></td>
                </tr>
              ))}
            </Table>
          </Card>
        </div>

        <Card>
          <CardTitle>Net-sıfır ilan matrisi</CardTitle>
          <div className="mb-2 text-[11.5px] font-medium lowercase text-ink/60">belediye</div>
          <Table head={["Belediye", "Yıl"]} dense>
            {belediyeler.map((b) => (
              <tr key={b.id}>
                <td className="p-2">{b.name}</td>
                <td className="p-2 text-right tabular-nums">
                  {b.netZeroYear ? (
                    <Badge tone={b.netZeroYear <= 2050 ? "leaf" : "warm"}>{b.netZeroYear}</Badge>
                  ) : (
                    <Badge tone="gray">yok</Badge>
                  )}
                </td>
              </tr>
            ))}
          </Table>
          <div className="mb-2 mt-4 text-[11.5px] font-medium lowercase text-ink/60">karbon bankası</div>
          <Table head={["Banka", "Yıl"]} dense>
            {bankalar.map((b) => (
              <tr key={b.id}>
                <td className="p-2">{b.name}</td>
                <td className="p-2 text-right tabular-nums">
                  {b.netZeroYear ? (
                    <Badge tone={b.netZeroYear <= 2050 ? "leaf" : "warm"}>{b.netZeroYear}</Badge>
                  ) : (
                    <Badge tone="gray">yok</Badge>
                  )}
                </td>
              </tr>
            ))}
          </Table>
        </Card>
      </div>
    </>
  );
}
