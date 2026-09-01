import { getScope } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader, KpiCard } from "@/components/ui";
import { GorevlerClient, type GorevRow } from "@/components/gorevler-client";
import { MERKEZ_ROLLER, birimKisitli } from "@/lib/yetki";

export default async function GorevlerPage() {
  const { session, org, birim } = await getScope();
  const bu = birim.unitId;

  const [tasks, units] = await Promise.all([
    prisma.dataTask.findMany({
      where: { orgId: org.id, ...(bu ? { unitId: bu } : {}) },
      include: { unit: { select: { name: true } } },
      orderBy: [{ status: "asc" }, { dueDate: "asc" }],
    }),
    prisma.unit.findMany({ where: { orgId: org.id }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  /* görevin dönem/kategori/biriminde girilmiş veri var mı? (tek sorgu) */
  const veriler = tasks.length
    ? await prisma.activityData.findMany({
        where: { OR: tasks.map((t) => ({ year: t.year, month: t.month, category: t.category, facility: { unitId: t.unitId } })) },
        select: { year: true, month: true, category: true, facility: { select: { unitId: true } } },
      })
    : [];
  const veriSet = new Set(veriler.map((v) => `${v.facility.unitId}|${v.year}|${v.month}|${v.category}`));

  const now = Date.now();
  const rows: GorevRow[] = tasks.map((t) => ({
    id: t.id, unitId: t.unitId, unit: t.unit.name,
    year: t.year, month: t.month, category: t.category,
    dueDate: t.dueDate.toISOString(), status: t.status,
    gecikti: t.status === "BEKLIYOR" && t.dueDate.getTime() < now,
    veriVar: veriSet.has(`${t.unitId}|${t.year}|${t.month}|${t.category}`),
  }));

  const bekleyen = rows.filter((r) => r.status === "BEKLIYOR" && !r.gecikti).length;
  const geciken = rows.filter((r) => r.gecikti).length;
  const tamamlanan = rows.filter((r) => r.status === "TAMAMLANDI").length;
  const veriGirilmis = rows.filter((r) => r.status === "BEKLIYOR" && r.veriVar).length;

  const canManage = MERKEZ_ROLLER.includes(session.role);
  const canComplete = canManage || birimKisitli(session.role);

  return (
    <>
      <PageHeader
        eyebrow="veri toplama"
        title="Görev yönetimi"
        desc={`${org.name} · müdürlüklere atanan dönem/kategori veri girişi görevleri`}
      />
      <div className="rise-1 mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="bekleyen görev" value={String(bekleyen)} hint="son tarihi geçmemiş" />
        <KpiCard label="geciken görev" value={String(geciken)} tone={geciken > 0 ? "danger" : "leaf"} hint="son tarih aşıldı" />
        <KpiCard label="veri girilmiş" value={String(veriGirilmis)} tone={veriGirilmis > 0 ? "warm" : "leaf"} hint="kapatılmayı bekliyor" />
        <KpiCard label="tamamlanan" value={String(tamamlanan)} hint="bu döngüde" />
      </div>
      <GorevlerClient rows={rows} units={units} canManage={canManage} canComplete={canComplete} />
    </>
  );
}
