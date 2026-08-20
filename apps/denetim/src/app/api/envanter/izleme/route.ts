import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiSession, apiOrgId } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { VERI_GIRIS_ROLLER, birimKisitli } from "@/lib/yetki";
import { donemKilitli, DONEM_KILIT_MESAJI } from "@/lib/donem";

/* ── izleme verisi: hesaplanamayan kalemler için aylık miktar kaydı ── */

/** GET /api/envanter/izleme?year=2026 — kurumun izleme kayıtları */
export async function GET(req: Request) {
  const s = await apiSession();
  if (!s) return NextResponse.json({ error: "Oturum gerekli" }, { status: 401 });
  const orgId = await apiOrgId(s);
  if (!orgId) return NextResponse.json({ error: "Kurum bulunamadı" }, { status: 400 });

  const url = new URL(req.url);
  const year = Number(url.searchParams.get("year")) || new Date().getFullYear();

  const entries = await prisma.inventoryEntry.findMany({
    where: {
      orgId, year,
      ...(birimKisitli(s.role) && s.unitId ? { item: { unitId: s.unitId } } : {}),
    },
    include: { item: { select: { name: true, unitName: true, dataUnit: true } } },
    orderBy: [{ month: "desc" }, { createdAt: "desc" }],
  });
  return NextResponse.json({ entries });
}

const createSchema = z.object({
  itemId: z.string().min(1),
  year: z.number().int().min(2000).max(2100),
  month: z.number().int().min(1).max(12),
  amount: z.number().min(0, "Miktar negatif olamaz"),
  note: z.string().max(300).optional(),
});

/** POST — izleme kaydı ekler/günceller (kalem+dönem başına tek satır). */
export async function POST(req: Request) {
  const s = await apiSession(VERI_GIRIS_ROLLER);
  if (!s) return NextResponse.json({ error: "Yetkiniz yok" }, { status: 403 });
  const orgId = await apiOrgId(s);
  if (!orgId) return NextResponse.json({ error: "Kurum bulunamadı" }, { status: 400 });

  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Geçersiz veri" }, { status: 400 });
  const d = parsed.data;

  const item = await prisma.inventoryItem.findUnique({
    where: { id: d.itemId },
    select: { orgId: true, unitId: true, name: true, mode: true, active: true, dataUnit: true },
  });
  if (!item || item.orgId !== orgId) return NextResponse.json({ error: "Kalem bulunamadı" }, { status: 404 });
  if (!item.active) return NextResponse.json({ error: "Pasif kalem için kayıt girilemez" }, { status: 400 });
  if (item.mode !== "IZLEME") return NextResponse.json({ error: "Bu kalem hesaplanabilir — veri girişi ekranını kullanın" }, { status: 400 });
  if (birimKisitli(s.role) && s.unitId && item.unitId !== s.unitId)
    return NextResponse.json({ error: "Bu kalem biriminizin kapsamında değil" }, { status: 403 });
  if (await donemKilitli(orgId, d.year, d.month))
    return NextResponse.json({ error: DONEM_KILIT_MESAJI }, { status: 403 });

  const entry = await prisma.inventoryEntry.upsert({
    where: { itemId_year_month: { itemId: d.itemId, year: d.year, month: d.month } },
    create: { orgId, itemId: d.itemId, year: d.year, month: d.month, amount: d.amount, note: d.note ?? null, createdById: s.sub },
    update: { amount: d.amount, note: d.note ?? null },
  });
  await audit(s.sub, "IZLEME_VERI_EKLE", "InventoryEntry", entry.id, `${item.name} · ${d.year}-${String(d.month).padStart(2, "0")} · ${d.amount} ${item.dataUnit}`, s.email);
  return NextResponse.json({ ok: true, id: entry.id }, { status: 201 });
}

/** DELETE /api/envanter/izleme?id=... */
export async function DELETE(req: Request) {
  const s = await apiSession(VERI_GIRIS_ROLLER);
  if (!s) return NextResponse.json({ error: "Yetkiniz yok" }, { status: 403 });
  const orgId = await apiOrgId(s);
  if (!orgId) return NextResponse.json({ error: "Kurum bulunamadı" }, { status: 400 });

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id gerekli" }, { status: 400 });

  const entry = await prisma.inventoryEntry.findUnique({
    where: { id },
    include: { item: { select: { unitId: true, name: true } } },
  });
  if (!entry || entry.orgId !== orgId) return NextResponse.json({ error: "Kayıt bulunamadı" }, { status: 404 });
  if (birimKisitli(s.role) && s.unitId && entry.item.unitId !== s.unitId)
    return NextResponse.json({ error: "Bu kayıt biriminizin kapsamında değil" }, { status: 403 });
  if (await donemKilitli(orgId, entry.year, entry.month))
    return NextResponse.json({ error: DONEM_KILIT_MESAJI }, { status: 403 });

  await prisma.inventoryEntry.delete({ where: { id } });
  await audit(s.sub, "IZLEME_VERI_SIL", "InventoryEntry", id, `${entry.item.name} · ${entry.year}-${String(entry.month).padStart(2, "0")}`, s.email);
  return NextResponse.json({ ok: true });
}
