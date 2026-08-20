/* Envanter kataloğu — kurumun izlediği envanter kalemleri (ISO 14064 kategorili) */
import { redirect } from "next/navigation";
import { getScope } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { KATALOG_YONETIM_ROLLER } from "@/lib/yetki";
import { PageHeader, Card, EmptyState } from "@/components/ui";
import { EnvanterKatalog, SablonAktarButonu, KalemEkleButonu } from "@/components/envanter-client";

export default async function EnvanterPage() {
  const { session, org, birim } = await getScope();
  if (org.type !== "BELEDIYE") redirect("/");

  const bu = birim.unitId;
  const canManage = (KATALOG_YONETIM_ROLLER as readonly string[]).includes(session.role);

  const [items, groups, units, sablonSayisi] = await Promise.all([
    prisma.inventoryItem.findMany({
      where: { orgId: org.id, ...(bu ? { unitId: bu } : {}) },
      include: { group: { select: { code: true, name: true, sortOrder: true } }, unit: { select: { name: true } } },
      orderBy: [{ unitName: "asc" }, { name: "asc" }],
    }),
    prisma.inventoryGroup.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
    prisma.unit.findMany({ where: { orgId: org.id }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.inventoryItem.count({ where: { orgId: null, active: true } }),
  ]);

  const dto = items.map((i) => ({
    id: i.id, name: i.name, unitName: i.unitName, dataUnit: i.dataUnit,
    isoCategory: i.isoCategory, mode: i.mode, categoryCode: i.categoryCode,
    customFactorKgCO2e: i.customFactorKgCO2e, active: i.active,
    groupCode: i.group.code, groupName: i.group.name, groupOrder: i.group.sortOrder,
  }));

  return (
    <>
      <PageHeader
        eyebrow="veri yönetişimi"
        title="Envanter kataloğu"
        desc={`${org.name} · ${items.length} kalem · kurumun sera gazı envanterinde izlenen faaliyet kalemleri`}
        actions={
          canManage ? (
            <div className="flex gap-2">
              <SablonAktarButonu sablonSayisi={sablonSayisi} />
              <KalemEkleButonu groups={groups.map((g) => ({ code: g.code, name: g.name }))} units={units} />
            </div>
          ) : undefined
        }
      />
      {items.length === 0 ? (
        <Card className="rise-1">
          <EmptyState
            title="Henüz envanter kalemi yok"
            desc={canManage ? `Küresel şablonda ${sablonSayisi} hazır kalem var — tek tıkla kurumunuza aktarın.` : "Katalog yöneticiniz kalemleri şablondan aktarabilir."}
            action={canManage ? <SablonAktarButonu sablonSayisi={sablonSayisi} birincil /> : undefined}
          />
        </Card>
      ) : (
        <EnvanterKatalog items={dto} canManage={canManage} groups={groups.map((g) => ({ code: g.code, name: g.name }))} units={units} />
      )}
    </>
  );
}
