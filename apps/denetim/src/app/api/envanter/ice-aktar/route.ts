import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiSession, apiOrgId } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { KATALOG_YONETIM_ROLLER } from "@/lib/yetki";

/* ── şablondan içe aktarma: küresel katalog → kurum kopyası (idempotent) ──
 * Aynı şablon kalemi (sourceItemId) kuruma ikinci kez kopyalanmaz. */

const schema = z.object({
  /** boş → tüm şablon; dolu → seçili şablon kalem id'leri */
  itemIds: z.array(z.string().min(1)).max(500).optional(),
  /** birim adı filtresi (ör. yalnız "Ulaşım DB" kalemleri) */
  birim: z.string().max(160).optional(),
});

export async function POST(req: Request) {
  const s = await apiSession(KATALOG_YONETIM_ROLLER);
  if (!s) return NextResponse.json({ error: "Yetkiniz yok" }, { status: 403 });
  const orgId = await apiOrgId(s);
  if (!orgId) return NextResponse.json({ error: "Kurum bulunamadı" }, { status: 400 });

  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Geçersiz veri" }, { status: 400 });
  const d = parsed.data;

  const templates = await prisma.inventoryItem.findMany({
    where: {
      orgId: null,
      active: true,
      ...(d.itemIds?.length ? { id: { in: d.itemIds } } : {}),
      ...(d.birim ? { unitName: d.birim } : {}),
    },
    orderBy: [{ unitName: "asc" }, { name: "asc" }],
  });
  if (templates.length === 0) return NextResponse.json({ error: "Aktarılacak şablon kalemi bulunamadı" }, { status: 404 });

  // idempotentlik: bu kuruma zaten kopyalanmış şablon kalemleri atla
  const existing = await prisma.inventoryItem.findMany({
    where: { orgId, sourceItemId: { in: templates.map((t) => t.id) } },
    select: { sourceItemId: true },
  });
  const done = new Set(existing.map((e) => e.sourceItemId));

  // birim adı → kurum birimi eşlemesi (birebir ad eşleşmesi)
  const units = await prisma.unit.findMany({ where: { orgId }, select: { id: true, name: true } });
  const unitByName = new Map(units.map((u) => [u.name, u.id]));

  const yeni = templates.filter((t) => !done.has(t.id));
  let eklenen = 0;
  for (const t of yeni) {
    await prisma.inventoryItem.create({
      data: {
        groupId: t.groupId, orgId, sourceItemId: t.id,
        unitId: unitByName.get(t.unitName) ?? null, unitName: t.unitName,
        name: t.name, dataUnit: t.dataUnit, isoCategory: t.isoCategory,
        mode: t.mode, categoryCode: t.categoryCode, customFactorKgCO2e: t.customFactorKgCO2e,
      },
    });
    eklenen++;
  }

  await audit(s.sub, "KALEM_ICE_AKTAR", "InventoryItem", null, `${eklenen} kalem şablondan aktarıldı (${templates.length - eklenen} zaten vardı)`, s.email);
  return NextResponse.json({ ok: true, eklenen, atlanan: templates.length - eklenen });
}
