/* Kamuya açık iklim portalı — oturum gerektirmez; portalAcik=true olan belediyeleri gösterir */
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { fmtTons, fmtInt, fmtPct } from "@/lib/format";

export const metadata = { title: "İklim Portalı — KarbonKent" };
export const revalidate = 300; // 5 dk önbellek

export default async function PortalPage() {
  const orgs = await prisma.organization.findMany({
    where: { portalAcik: true },
    select: { id: true, name: true, baselineYear: true, netZeroYear: true },
    orderBy: { name: "asc" },
  });

  const cards = await Promise.all(orgs.map(async (org) => {
    const year = new Date().getFullYear() > 2026 ? 2026 : 2025;
    const [records, targets, actions] = await Promise.all([
      prisma.emissionRecord.findMany({
        where: { activityData: { facility: { orgId: org.id } } },
        select: { tCO2e: true, activityData: { select: { year: true } } },
      }),
      prisma.target.findMany({ where: { orgId: org.id }, orderBy: { year: "asc" } }),
      prisma.actionPlan.findMany({
        where: { orgId: org.id },
        select: { title: true, status: true, targetReductionTCO2e: true, progress: { select: { achievedTCO2e: true } } },
      }),
    ]);
    const byYear = new Map<number, number>();
    for (const r of records) byYear.set(r.activityData.year, (byYear.get(r.activityData.year) ?? 0) + r.tCO2e);
    const current = byYear.get(year) ?? 0;
    const baseline = byYear.get(org.baselineYear) ?? 0;
    const target = targets.find((t) => t.year === year)?.targetTCO2e ?? null;
    const achieved = actions.reduce((s, a) => s + a.progress.reduce((x, p) => x + p.achievedTCO2e, 0), 0);
    const planned = actions.reduce((s, a) => s + a.targetReductionTCO2e, 0);
    return { org, year, current, baseline, target, achieved, planned, actionCount: actions.length };
  }));

  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-leaf-700">karbonkent kurumsal · iklim portalı</p>
      <h1 className="mb-2 text-[28px] font-bold tracking-tight">Belediyelerin iklim karnesi</h1>
      <p className="mb-8 text-[14px] text-ink/55">
        Kamuya açık envanter özetleri. Veriler ilgili belediyelerin onaylı sera gazı envanterlerinden derlenir.
      </p>

      {cards.length === 0 && (
        <p className="rounded-2xl border border-leaf-200/60 bg-white/60 p-8 text-center text-[14px] text-ink/50">
          Henüz portalını açan belediye yok.
        </p>
      )}

      <div className="grid gap-5">
        {cards.map(({ org, year, current, baseline, target, achieved, planned, actionCount }) => {
          const change = baseline > 0 ? ((current - baseline) / baseline) * 100 : null;
          return (
            <section key={org.id} className="rounded-2xl border border-leaf-200/60 bg-white/70 p-6 shadow-sm">
              <div className="mb-4 flex items-baseline justify-between">
                <h2 className="text-[18px] font-bold tracking-tight">{org.name}</h2>
                <span className="text-[12px] text-ink/45">net sıfır hedefi: {org.netZeroYear}</span>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-ink/45">{year} emisyonu</p>
                  <p className="text-[20px] font-bold tabular-nums">{fmtTons(current)} tCO₂e</p>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-ink/45">baz yıla göre ({org.baselineYear})</p>
                  <p className={`text-[20px] font-bold tabular-nums ${change !== null && change < 0 ? "text-leaf-700" : ""}`}>
                    {change === null ? "—" : fmtPct(change)}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-ink/45">{year} hedefi</p>
                  <p className="text-[20px] font-bold tabular-nums">{target === null ? "—" : `${fmtInt(target)} tCO₂e`}</p>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-ink/45">eylem planı</p>
                  <p className="text-[20px] font-bold tabular-nums">{actionCount} eylem</p>
                  <p className="text-[11.5px] text-ink/45">{fmtTons(achieved)} / {fmtTons(planned)} tCO₂e azaltım</p>
                </div>
              </div>
            </section>
          );
        })}
      </div>

      <p className="mt-10 text-center text-[12px] text-ink/40">
        <Link href="/giris" className="underline decoration-leaf-300 hover:text-leaf-700">kurumsal giriş</Link> · KarbonKent Kurumsal
      </p>
    </main>
  );
}
