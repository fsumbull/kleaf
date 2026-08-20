import Link from "next/link";
import { getScope } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getEmissionRows } from "@/lib/data";
import { totalsByFacility, intensity } from "@/lib/carbon/engine";
import { PageHeader, Card, Badge, EmptyState } from "@/components/ui";
import { TesisEkleButonu, TesisKartAksiyonlari } from "@/components/tesis-client";
import { FACILITY_TYPE_LABELS, type FacilityType } from "@/lib/constants";
import { fmtTons, fmt1, fmtInt } from "@/lib/format";

export default async function TesislerPage() {
  const { session, org, year, birim } = await getScope();
  const canEdit = ["SUPER_ADMIN", "IKLIM_MERKEZI", "ENERJI_YONETICISI"].includes(session.role);
  const bu = birim.unitId;

  const [facilities, rows, units] = await Promise.all([
    prisma.facility.findMany({
      where: { orgId: org.id, ...(bu ? { unitId: bu } : {}) },
      include: { unit: { select: { name: true } }, _count: { select: { activityData: true } } },
      orderBy: { name: "asc" },
    }),
    getEmissionRows(org.id, bu),
    prisma.unit.findMany({ where: { orgId: org.id }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  const totals = totalsByFacility(rows.filter((r) => r.year === year));
  const maxTotal = Math.max(1, ...totals.values());

  return (
    <>
      <PageHeader
        eyebrow="tesisler"
        title="Tesis envanteri"
        desc={`${org.name} bünyesindeki ${facilities.length} tesis · ${year} emisyonlarıyla`}
        actions={canEdit ? <TesisEkleButonu orgId={org.id} units={units} /> : undefined}
      />

      {facilities.length === 0 ? (
        <Card><EmptyState title="Henüz tesis tanımlanmamış" desc={canEdit ? "Sağ üstteki 'yeni tesis' butonuyla ilk tesisinizi oluşturun." : "Kurum yöneticiniz tesis eklediğinde burada görünür."} /></Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {facilities.map((f, i) => {
            const t = totals.get(f.id) ?? 0;
            const perArea = intensity(t * 1000, f.areaM2); // kg/m²
            const perStaff = intensity(t, f.staffCount);
            const pct = Math.max(0, Math.min(100, (t / maxTotal) * 100));
            return (
              <div key={f.id} className={`rise-${Math.min(4, i % 4 + 1)}`}>
                <Card className="h-full transition hover:-translate-y-0.5 hover:shadow-[0_20px_48px_-20px_rgba(12,74,51,0.3)]">
                  <Link href={`/tesisler/${f.id}`} className="block">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="truncate text-[15px] font-bold tracking-tight text-ink">{f.name}</h3>
                        <p className="mt-0.5 text-[11.5px] text-ink/45">
                          {FACILITY_TYPE_LABELS[f.type as FacilityType] ?? f.type}
                          {f.unit && <> · {f.unit.name}</>}
                        </p>
                      </div>
                      <Badge tone={f.type === "GES" ? "leaf" : "gray"}>
                        {f.type === "GES" ? "mahsup" : `${f._count.activityData} kayıt`}
                      </Badge>
                    </div>

                    <p className="mt-4 text-[24px] font-bold leading-none tracking-tight text-leaf-600">
                      {fmtTons(t)} <span className="text-[12px] font-medium text-ink/40">tCO₂e · {year}</span>
                    </p>

                    <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-leaf-100">
                      <div className="h-full rounded-full bg-gradient-to-r from-leaf-600 to-leaf-400" style={{ width: `${pct}%` }} />
                    </div>

                    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11.5px] text-ink/50">
                      {f.areaM2 && <span>{fmtInt(f.areaM2)} m²{perArea !== null && <> · {fmt1(perArea)} kg/m²</>}</span>}
                      {f.staffCount && <span>{fmtInt(f.staffCount)} kişi{perStaff !== null && <> · {fmt1(perStaff)} t/kişi</>}</span>}
                    </div>
                  </Link>
                  {canEdit && (
                    <TesisKartAksiyonlari
                      tesis={{
                        id: f.id, name: f.name, type: f.type, areaM2: f.areaM2, staffCount: f.staffCount,
                        unitId: f.unitId, installedKwp: f.installedKwp, commissionYear: f.commissionYear, capexTRY: f.capexTRY,
                      }}
                      orgId={org.id}
                      units={units}
                      recordCount={f._count.activityData}
                    />
                  )}
                </Card>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
