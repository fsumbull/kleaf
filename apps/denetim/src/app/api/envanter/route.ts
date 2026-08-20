import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiSession, apiOrgId } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { CATEGORY_CODES, ISO_CATEGORIES, INVENTORY_MODES } from "@/lib/constants";
import { KATALOG_YONETIM_ROLLER, birimKisitli } from "@/lib/yetki";
import { kalemEslestir } from "@/lib/envanter";

/* ── envanter kataloğu: kurum kalemleri listesi + kalem ekleme/güncelleme ── */

/** GET /api/envanter?sablon=1 → küresel şablon; varsayılan: etkin kurumun kalemleri.
 *  Birim kısıtlı roller yalnız kendi biriminin kalemlerini görür. */
export async function GET(req: Request) {
  const s = await apiSession();
  if (!s) return NextResponse.json({ error: "Oturum gerekli" }, { status: 401 });
  const orgId = await apiOrgId(s);
  if (!orgId) return NextResponse.json({ error: "Kurum bulunamadı" }, { status: 400 });

  const url = new URL(req.url);
  const sablon = url.searchParams.get("sablon") === "1";

  const items = await prisma.inventoryItem.findMany({
    where: sablon
      ? { orgId: null }
      : {
          orgId,
          ...(birimKisitli(s.role) && s.unitId ? { unitId: s.unitId } : {}),
        },
    include: {
      group: { select: { code: true, name: true, sortOrder: true } },
      unit: { select: { id: true, name: true } },
    },
    orderBy: [{ unitName: "asc" }, { name: "asc" }],
  });

  return NextResponse.json({
    items: items.map((i) => ({
      id: i.id, name: i.name, unitName: i.unitName, unitId: i.unitId, unit: i.unit?.name ?? null,
      dataUnit: i.dataUnit, isoCategory: i.isoCategory, mode: i.mode, categoryCode: i.categoryCode,
      customFactorKgCO2e: i.customFactorKgCO2e, active: i.active, sourceItemId: i.sourceItemId,
      group: i.group,
    })),
  });
}

const createSchema = z.object({
  name: z.string().min(3, "Kalem adı en az 3 karakter").max(200),
  groupCode: z.string().min(1),
  unitId: z.string().min(1).optional().nullable(),
  unitName: z.string().max(160).optional(),
  dataUnit: z.string().min(1).max(60),
  isoCategory: z.enum(ISO_CATEGORIES),
  mode: z.enum(INVENTORY_MODES).optional(),
  categoryCode: z.enum(CATEGORY_CODES).optional().nullable(),
  customFactorKgCO2e: z.number().min(0, "Faktör negatif olamaz").optional().nullable(),
});

/** POST — kuruma yeni kalem ekler. mode/categoryCode verilmezse otomatik eşleme uygulanır. */
export async function POST(req: Request) {
  const s = await apiSession(KATALOG_YONETIM_ROLLER);
  if (!s) return NextResponse.json({ error: "Yetkiniz yok" }, { status: 403 });
  const orgId = await apiOrgId(s);
  if (!orgId) return NextResponse.json({ error: "Kurum bulunamadı" }, { status: 400 });

  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Geçersiz veri" }, { status: 400 });
  const d = parsed.data;

  const group = await prisma.inventoryGroup.findUnique({ where: { code: d.groupCode }, select: { id: true } });
  if (!group) return NextResponse.json({ error: "Envanter grubu bulunamadı" }, { status: 404 });

  let unitName = d.unitName?.trim() ?? "";
  if (d.unitId) {
    const unit = await prisma.unit.findUnique({ where: { id: d.unitId }, select: { orgId: true, name: true } });
    if (!unit || unit.orgId !== orgId) return NextResponse.json({ error: "Birim bulunamadı" }, { status: 404 });
    unitName = unit.name;
  }
  if (!unitName) return NextResponse.json({ error: "Birim seçin veya birim adı girin" }, { status: 400 });

  // otomatik eşleme — açıkça verilmediyse
  const oto = kalemEslestir(d.name, d.dataUnit);
  const mode = d.mode ?? oto.mode;
  const categoryCode = d.categoryCode !== undefined ? d.categoryCode : oto.categoryCode;
  if (mode === "HESAPLANABILIR" && !categoryCode)
    return NextResponse.json({ error: "Hesaplanabilir kalem için emisyon kategorisi seçin" }, { status: 400 });

  const item = await prisma.inventoryItem.create({
    data: {
      groupId: group.id, orgId, unitId: d.unitId ?? null, unitName,
      name: d.name.trim(), dataUnit: d.dataUnit.trim(), isoCategory: d.isoCategory,
      mode, categoryCode: mode === "HESAPLANABILIR" ? categoryCode : null,
      customFactorKgCO2e: d.customFactorKgCO2e ?? null,
    },
  });
  await audit(s.sub, "KALEM_EKLE", "InventoryItem", item.id, `${item.name} (${item.dataUnit}, ${item.mode})`, s.email);
  return NextResponse.json({ ok: true, id: item.id }, { status: 201 });
}

const patchSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(3).max(200).optional(),
  unitId: z.string().min(1).optional().nullable(),
  dataUnit: z.string().min(1).max(60).optional(),
  isoCategory: z.enum(ISO_CATEGORIES).optional(),
  mode: z.enum(INVENTORY_MODES).optional(),
  categoryCode: z.enum(CATEGORY_CODES).optional().nullable(),
  customFactorKgCO2e: z.number().min(0, "Faktör negatif olamaz").optional().nullable(),
  active: z.boolean().optional(),
});

/** PATCH — kalem günceller; active=false pasifleştirir (silme yoktur, bağlı veriler korunur). */
export async function PATCH(req: Request) {
  const s = await apiSession(KATALOG_YONETIM_ROLLER);
  if (!s) return NextResponse.json({ error: "Yetkiniz yok" }, { status: 403 });
  const orgId = await apiOrgId(s);
  if (!orgId) return NextResponse.json({ error: "Kurum bulunamadı" }, { status: 400 });

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Geçersiz veri" }, { status: 400 });
  const { id, ...d } = parsed.data;

  // sahiplik: yalnız kendi kurumunun kalemi (şablon kalemleri API'dan değiştirilemez)
  const target = await prisma.inventoryItem.findUnique({ where: { id }, select: { orgId: true, mode: true, categoryCode: true, name: true } });
  if (!target || target.orgId !== orgId) return NextResponse.json({ error: "Kalem bulunamadı" }, { status: 404 });

  if (d.unitId) {
    const unit = await prisma.unit.findUnique({ where: { id: d.unitId }, select: { orgId: true } });
    if (!unit || unit.orgId !== orgId) return NextResponse.json({ error: "Birim bulunamadı" }, { status: 404 });
  }

  const nextMode = d.mode ?? target.mode;
  const nextCategory = d.categoryCode !== undefined ? d.categoryCode : target.categoryCode;
  if (nextMode === "HESAPLANABILIR" && !nextCategory)
    return NextResponse.json({ error: "Hesaplanabilir kalem için emisyon kategorisi seçin" }, { status: 400 });

  const unitName = d.unitId
    ? (await prisma.unit.findUnique({ where: { id: d.unitId }, select: { name: true } }))?.name
    : undefined;

  const updated = await prisma.inventoryItem.update({
    where: { id },
    data: {
      ...(d.name !== undefined ? { name: d.name.trim() } : {}),
      ...(d.unitId !== undefined ? { unitId: d.unitId } : {}),
      ...(unitName ? { unitName } : {}),
      ...(d.dataUnit !== undefined ? { dataUnit: d.dataUnit.trim() } : {}),
      ...(d.isoCategory !== undefined ? { isoCategory: d.isoCategory } : {}),
      mode: nextMode,
      categoryCode: nextMode === "HESAPLANABILIR" ? nextCategory : null,
      ...(d.customFactorKgCO2e !== undefined ? { customFactorKgCO2e: d.customFactorKgCO2e } : {}),
      ...(d.active !== undefined ? { active: d.active } : {}),
    },
  });
  await audit(
    s.sub,
    d.active === false ? "KALEM_PASIF" : "KALEM_GUNCELLE",
    "InventoryItem",
    id,
    `${updated.name}${d.active === false ? " pasifleştirildi" : ""}`,
    s.email
  );
  return NextResponse.json({ ok: true });
}
