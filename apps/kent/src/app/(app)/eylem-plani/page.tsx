import { getScope } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader, KpiCard } from "@/components/ui";
import { EylemClient, type PlanView } from "@/components/eylem-client";
import { fmtTons, fmtTRY } from "@/lib/format";

export default async function EylemPlaniPage() {
  const { session, org } = await getScope();

  const [plans, units] = await Promise.all([
    prisma.actionPlan.findMany({
      where: { orgId: org.id },
      include: { progress: { orderBy: { date: "desc" } }, unit: { select: { name: true } } },
      orderBy: { title: "asc" },
    }),
    prisma.unit.findMany({
      where: { orgId: org.id },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const views: PlanView[] = plans.map((p) => ({
    id: p.id,
    title: p.title,
    description: p.description,
    budgetTRY: p.budgetTRY,
    targetReductionTCO2e: p.targetReductionTCO2e,
    status: p.status,
    owner: p.owner,
    startYear: p.startYear,
    unitId: p.unitId,
    unitName: p.unit?.name ?? null,
    startDate: p.startDate?.toISOString() ?? null,
    endDate: p.endDate?.toISOString() ?? null,
    riskNote: p.riskNote,
    achieved: p.progress.reduce((s, x) => s + x.achievedTCO2e, 0),
    spent: p.progress.reduce((s, x) => s + (x.spentTRY ?? 0), 0),
    progress: p.progress.map((x) => ({
      id: x.id, date: x.date.toISOString(), note: x.note, achievedTCO2e: x.achievedTCO2e, spentTRY: x.spentTRY,
    })),
  }));

  const totalTarget = views.reduce((s, v) => s + v.targetReductionTCO2e, 0);
  const totalAchieved = views.reduce((s, v) => s + v.achieved, 0);
  const totalBudget = views.reduce((s, v) => s + (v.budgetTRY ?? 0), 0);
  const gecikmis = views.filter((v) => v.endDate && new Date(v.endDate) < new Date() && v.status !== "TAMAMLANDI").length;

  const canManage = ["SUPER_ADMIN", "IKLIM_MERKEZI", "MALI_HIZMETLER"].includes(session.role);
  const canProgress = ["SUPER_ADMIN", "IKLIM_MERKEZI", "MALI_HIZMETLER", "MUDURLUK_VERI"].includes(session.role);

  return (
    <>
      <PageHeader
        eyebrow="eylem planı"
        title="İklim eylem planı"
        desc={`${org.netZeroYear} net-sıfır hedefine giden azaltım eylemleri — etki, bütçe ve ilerleme takibi`}
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rise-1">
          <KpiCard label="toplam hedef azaltım" value={fmtTons(totalTarget)} unit="tCO₂e/yıl"
            hint={`${views.length} eylem`} />
        </div>
        <div className="rise-2">
          <KpiCard label="gerçekleşen azaltım" value={fmtTons(totalAchieved)} unit="tCO₂e"
            hint={totalTarget > 0 ? `hedefin %${((totalAchieved / totalTarget) * 100).toFixed(0)}'i` : undefined} />
        </div>
        <div className="rise-3">
          <KpiCard label="toplam bütçe" value={fmtTRY(totalBudget)}
            hint={totalAchieved > 0 && totalBudget > 0 ? `≈ ${fmtTRY(totalBudget / Math.max(1, totalTarget))} / tCO₂e` : undefined} />
        </div>
        <div className="rise-4">
          <KpiCard label="geciken eylem" value={String(gecikmis)} unit="adet" tone={gecikmis > 0 ? "warm" : "leaf"}
            hint="bitiş tarihi geçmiş, tamamlanmamış" />
        </div>
      </div>

      <EylemClient plans={views} orgId={org.id} units={units} canManage={canManage} canProgress={canProgress} />
    </>
  );
}
