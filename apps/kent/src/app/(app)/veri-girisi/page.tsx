import { Suspense } from "react";
import { getScope } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui";
import { VeriGirisiClient, type VeriRow } from "@/components/veri-girisi-client";

const PAGE_SIZE = 50;

export default async function VeriGirisiPage({ searchParams }: {
  searchParams: Promise<{
    tesis?: string; kategori?: string; ay?: string; durum?: string;
    yil?: string; q?: string; sayfa?: string; yeni?: string; duzenle?: string;
  }>;
}) {
  const { session, org, year: cookieYear, birim } = await getScope();
  const sp = await searchParams;
  const bu = birim.unitId;

  // yıl filtresi: url parametresi çerez yılını geçersiz kılar
  const yilParam = Number(sp.yil);
  const year = Number.isInteger(yilParam) && yilParam >= 2000 && yilParam <= 2100 ? yilParam : cookieYear;
  const page = Math.max(1, Number(sp.sayfa) || 1);
  const q = (sp.q ?? "").trim();

  const [facilities, vehicles, yearsRaw, kalemler] = await Promise.all([
    prisma.facility.findMany({
      where: { orgId: org.id, ...(bu ? { unitId: bu } : {}) },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.vehicle.findMany({
      where: { orgId: org.id, active: true, ...(bu ? { facility: { unitId: bu } } : {}) },
      select: { id: true, plateNo: true, name: true, facilityId: true },
      orderBy: { plateNo: "asc" },
    }),
    prisma.activityData.findMany({
      where: { facility: { orgId: org.id, ...(bu ? { unitId: bu } : {}) } },
      select: { year: true },
      distinct: ["year"],
      orderBy: { year: "desc" },
    }),
    // hesaplanabilir envanter kalemleri — kalem seçilince kategori otomatik çözülür
    prisma.inventoryItem.findMany({
      where: {
        orgId: org.id, active: true, mode: "HESAPLANABILIR",
        ...(bu ? { unitId: bu } : {}),
      },
      select: { id: true, name: true, unitName: true, dataUnit: true, categoryCode: true },
      orderBy: [{ unitName: "asc" }, { name: "asc" }],
    }),
  ]);
  const years = [...new Set([...yearsRaw.map((r) => r.year), cookieYear])].sort((a, b) => b - a);

  const where = {
    facility: { orgId: org.id, ...(bu ? { unitId: bu } : {}) },
    year,
    ...(sp.tesis ? { facilityId: sp.tesis } : {}),
    ...(sp.kategori ? { category: sp.kategori } : {}),
    ...(sp.ay ? { month: Number(sp.ay) || undefined } : {}),
    ...(sp.durum ? { status: sp.durum } : {}),
    ...(q
      ? { OR: [{ documentRef: { contains: q } }, { facility: { orgId: org.id, name: { contains: q } } }] }
      : {}),
  };

  const [total, activities] = await Promise.all([
    prisma.activityData.count({ where }),
    prisma.activityData.findMany({
      where,
      include: {
        facility: { select: { name: true } },
        vehicle: { select: { plateNo: true } },
        emissionRecord: { select: { tCO2e: true } },
        documents: { select: { id: true, fileName: true, mime: true } },
      },
      orderBy: [{ year: "desc" }, { month: "desc" }, { facility: { name: "asc" } }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const rows: VeriRow[] = activities.map((a) => ({
    id: a.id,
    facilityId: a.facilityId,
    facility: a.facility.name,
    vehicle: a.vehicle?.plateNo ?? null,
    year: a.year,
    month: a.month,
    category: a.category,
    amount: a.amount,
    unit: a.unit,
    documentRef: a.documentRef,
    status: a.status,
    tCO2e: a.emissionRecord?.tCO2e ?? null,
    documents: a.documents.map((doc) => ({ id: doc.id, fileName: doc.fileName, mime: doc.mime })),
  }));

  const canEdit = ["SUPER_ADMIN", "IKLIM_MERKEZI", "MUDURLUK_VERI", "ENERJI_YONETICISI", "FILO_YONETICISI", "ATIK_UZMANI"].includes(session.role);
  const canApprove = ["SUPER_ADMIN", "IKLIM_MERKEZI"].includes(session.role);
  const canUnitApprove = session.role === "MUDURLUK_ONAY";

  return (
    <>
      <PageHeader
        eyebrow="veri girişi"
        title={`${year} faaliyet verileri`}
        desc="Faaliyet verilerini girin, Excel ile toplu aktarın; onaylanan kayıtlar emisyon envanterine işlenir."
      />
      <Suspense>
        <VeriGirisiClient
          rows={rows} facilities={facilities} vehicles={vehicles} kalemler={kalemler}
          canEdit={canEdit} canApprove={canApprove} canUnitApprove={canUnitApprove} year={year}
          years={years} page={page} pages={pages} total={total}
        />
      </Suspense>
    </>
  );
}
