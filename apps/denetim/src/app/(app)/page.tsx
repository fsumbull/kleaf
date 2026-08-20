import { getScope } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader, KpiCard, Card, CardTitle, EmptyState } from "@/components/ui";
import Link from "next/link";

export default async function KleafDenetimGenel() {
  const { org } = await getScope();
  if (org.type !== "KLEAF") {
    return (
      <Card className="rise-1">
        <EmptyState title="Bu Kleaf Denetim uygulamasıdır" desc="Yetkilendirme yalnız KLEAF org tipi içindir." />
      </Card>
    );
  }

  // Ulusal (tüm organizasyonlar) — KLEAF çoklu-org görür
  const [orgs, allPools, allTx, openFlags, resolvedFlags, decisions, bldEmissions, aktifEylem, kararsizEylem] = await Promise.all([
    prisma.organization.findMany({ where: { type: { in: ["KARBON_BANK", "BELEDIYE", "SANAYI", "KAMU"] } }, select: { id: true, name: true, type: true, portalAcik: true, netZeroYear: true } }),
    prisma.creditPool.findMany({ select: { id: true, poolType: true, totalTCO2e: true, availableTCO2e: true, bufferPct: true } }),
    prisma.creditTransaction.findMany({ select: { status: true, amountTCO2e: true, priceTRYPerTon: true, bankOrgId: true, buyerOrgId: true } }),
    prisma.complianceFlag.count({ where: { durum: "ACIK" } }),
    prisma.complianceFlag.count({ where: { durum: "COZULDU" } }),
    prisma.auditDecision.findMany({ select: { karar: true } }),
    // Türkiye toplam envanter (belediye emisyon kayıtları)
    prisma.emissionRecord.findMany({
      where: { activityData: { facility: { org: { type: "BELEDIYE" } } } },
      select: { scope: true, tCO2e: true, activityData: { select: { year: true } } },
    }),
    prisma.actionPlan.count({ where: { status: { in: ["PLANLANDI", "DEVAM_EDIYOR"] } } }),
    prisma.actionPlan.count(),
  ]);

  const kurumSay = orgs.length;
  const belediyeSay = orgs.filter((o) => o.type === "BELEDIYE").length;
  const havuzSay = allPools.length;
  const rezervSay = allPools.filter((p) => p.poolType === "BANKA_REZERV").length;
  const toplamHavuz = allPools.reduce((a, p) => a + p.totalTCO2e, 0);
  const kalanHavuz = allPools.reduce((a, p) => a + p.availableTCO2e, 0);
  const bufferAlti = allPools.filter((p) => p.availableTCO2e > 0 && p.availableTCO2e / p.totalTCO2e < p.bufferPct / 100).length;

  const askidaki = allTx.filter((t) => t.status === "DENETIM_ASKI").length;
  const aktifTx = allTx.filter((t) => t.status === "TRANSFER").length;
  const kararSay = { ONAY: 0, ASKI: 0, ITIRAZ: 0 } as Record<string, number>;
  for (const d of decisions) kararSay[d.karar] = (kararSay[d.karar] ?? 0) + 1;

  // Ulusal envanter agregatı (Türkiye toplam — belediyeler)
  const trToplamTCO2e = bldEmissions.reduce((a, r) => a + r.tCO2e, 0);
  const trMtCO2e = trToplamTCO2e / 1_000_000; // milyon ton
  const scope1 = bldEmissions.filter((r) => r.scope === 1).reduce((a, r) => a + r.tCO2e, 0);
  const scope2 = bldEmissions.filter((r) => r.scope === 2).reduce((a, r) => a + r.tCO2e, 0);
  const scope3 = bldEmissions.filter((r) => r.scope === 3).reduce((a, r) => a + r.tCO2e, 0);
  const portalAcikSay = orgs.filter((o) => o.type === "BELEDIYE" && o.portalAcik).length;
  const netZeroIlan = orgs.filter((o) => o.type === "BELEDIYE" && o.netZeroYear && o.netZeroYear <= 2053).length;

  return (
    <>
      <PageHeader
        eyebrow="ulusal denetim otoritesi"
        title="Kleaf Denetim — genel bakış"
        desc={`${kurumSay} izlenen kurum · ${havuzSay} kredi havuzu (${rezervSay} banka rezervi) · ${aktifTx} aktif transfer`}
      />

      <div className="rise mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="izlenen kurum" value={String(kurumSay)} hint={`${orgs.filter((o) => o.type === "KARBON_BANK").length} banka · ${belediyeSay} belediye`} tone="leaf" />
        <KpiCard label="açık bayrak" value={String(openFlags)} hint={`${resolvedFlags} çözüldü`} tone={openFlags > 0 ? "warm" : "leaf"} />
        <KpiCard label="askıya alınan işlem" value={String(askidaki)} hint={`${kararSay.ASKI ?? 0} askı kararı · ${kararSay.ITIRAZ ?? 0} itiraz`} tone={askidaki > 0 ? "warm" : "leaf"} />
        <KpiCard label="buffer altı havuz" value={String(bufferAlti)} hint={`${toplamHavuz.toLocaleString("tr-TR")} tCO₂e toplam · ${kalanHavuz.toLocaleString("tr-TR")} kalan`} tone={bufferAlti > 0 ? "danger" : "leaf"} />
      </div>

      <div className="rise mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Türkiye toplam envanter" value={trMtCO2e >= 1 ? trMtCO2e.toLocaleString("tr-TR", { maximumFractionDigits: 2 }) : (trToplamTCO2e / 1000).toLocaleString("tr-TR", { maximumFractionDigits: 1 })} unit={trMtCO2e >= 1 ? "MtCO₂e" : "ktCO₂e"} hint={`K1: ${(scope1 / 1000).toLocaleString("tr-TR", { maximumFractionDigits: 1 })}k · K2: ${(scope2 / 1000).toLocaleString("tr-TR", { maximumFractionDigits: 1 })}k · K3: ${(scope3 / 1000).toLocaleString("tr-TR", { maximumFractionDigits: 1 })}k`} tone="leaf" href="/ulusal-envanter" />
        <KpiCard label="portalı açık belediye" value={`${portalAcikSay} / ${belediyeSay}`} hint="şeffaflık portalını aktifleştiren belediye sayısı" tone={portalAcikSay > 0 ? "leaf" : "warm"} href="/kamu-portal-denetim" />
        <KpiCard label="net-sıfır ilanı" value={`${netZeroIlan} / ${belediyeSay}`} hint="≤ 2053 net-sıfır bildirimi" tone="leaf" href="/mevzuat" />
        <KpiCard label="aktif eylem planı" value={String(aktifEylem)} hint={`${kararsizEylem} toplam eylem`} tone={aktifEylem > 0 ? "leaf" : "warm"} />
      </div>

      <div className="rise-1 grid gap-4 lg:grid-cols-3">
        <Card>
          <CardTitle>hızlı erişim</CardTitle>
          <div className="mt-3 grid gap-2">
            <QuickLink href="/kredi-denetimi" label="kredi denetimi" desc="işlemleri incele, ASKI/ONAY/İTİRAZ kararı ver" />
            <QuickLink href="/bayraklar" label="uyum bayrakları" desc="otomatik tetiklenen risk sinyallerini işle" />
            <QuickLink href="/uyum-raporu" label="uyum raporu" desc="kurum bazlı denetim PDF üret" />
            <QuickLink href="/denetim" label="birleşik denetim izi" desc="tüm kurumların audit log'larını birleşik gör" />
          </div>
        </Card>
        <Card>
          <CardTitle>kurum listesi</CardTitle>
          <div className="mt-3 space-y-1.5 text-[12.5px]">
            {orgs.slice(0, 12).map((o) => (
              <div key={o.id} className="flex items-center justify-between rounded-lg bg-white/60 px-2.5 py-1.5">
                <span>{o.name}</span>
                <span className="rounded-full bg-leaf-100 px-2 py-0.5 text-[10.5px] uppercase tracking-wide text-leaf-700">{o.type}</span>
              </div>
            ))}
            {orgs.length > 12 && <p className="text-[11px] text-ink/45">+{orgs.length - 12} kurum daha</p>}
          </div>
        </Card>
        <Card>
          <CardTitle>karar özeti</CardTitle>
          <div className="mt-3 space-y-2 text-[13px]">
            <RowKV k="Onay" v={String(kararSay.ONAY ?? 0)} />
            <RowKV k="Askı" v={String(kararSay.ASKI ?? 0)} />
            <RowKV k="İtiraz" v={String(kararSay.ITIRAZ ?? 0)} />
            <RowKV k="Açık bayrak" v={String(openFlags)} />
            <RowKV k="Toplam karar" v={String(decisions.length)} />
          </div>
        </Card>
      </div>
    </>
  );
}

function QuickLink({ href, label, desc }: { href: string; label: string; desc: string }) {
  return (
    <Link href={href} className="group flex items-center justify-between rounded-xl border border-leaf-200/50 bg-white/60 px-3 py-2.5 transition hover:border-leaf-300 hover:bg-leaf-50/60">
      <div>
        <p className="text-[13px] font-medium text-ink">{label}</p>
        <p className="text-[11.5px] text-ink/55">{desc}</p>
      </div>
      <span className="text-leaf-600 opacity-0 transition group-hover:opacity-100">→</span>
    </Link>
  );
}

function RowKV({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-between border-b border-leaf-200/30 pb-1.5 last:border-0">
      <span className="text-ink/60">{k}</span>
      <span className="font-medium text-ink">{v}</span>
    </div>
  );
}
