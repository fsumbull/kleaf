/* Veri toplama görevleri — merkez birimlere dönem/kategori görevi atar,
 * birimler tamamlar; geciken görevler bildirim merkezine düşer. */
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiSession } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { MERKEZ_ROLLER, birimKisitli } from "@/lib/yetki";
import { CATEGORIES } from "@/lib/constants";

const CATEGORY_CODES = CATEGORIES.map((c) => c.code);

const createSchema = z.object({
  unitId: z.string().min(1, "Birim seçin"),
  year: z.number().int().min(2000).max(2100),
  month: z.number().int().min(1).max(12),
  category: z.string().refine((c) => (CATEGORY_CODES as string[]).includes(c), "Geçersiz kategori"),
  dueDate: z.string().refine((s) => !Number.isNaN(Date.parse(s)), "Geçersiz tarih"),
});

export async function POST(req: Request) {
  const s = await apiSession(MERKEZ_ROLLER);
  if (!s || !s.orgId) return NextResponse.json({ error: "Yetkiniz yok" }, { status: 403 });

  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Geçersiz veri" }, { status: 400 });
  const d = parsed.data;

  const unit = await prisma.unit.findUnique({ where: { id: d.unitId }, select: { orgId: true, name: true } });
  if (!unit || unit.orgId !== s.orgId) return NextResponse.json({ error: "Birim bulunamadı" }, { status: 404 });

  const task = await prisma.dataTask.create({
    data: {
      orgId: s.orgId, unitId: d.unitId, year: d.year, month: d.month,
      category: d.category, dueDate: new Date(d.dueDate), status: "BEKLIYOR",
    },
  });
  await audit(s.sub, "GOREV_OLUSTUR", "DataTask", task.id, `${unit.name} · ${d.category} · ${d.month}/${d.year}`, s.email);
  return NextResponse.json({ ok: true, id: task.id }, { status: 201 });
}

const patchSchema = z.object({
  id: z.string().min(1),
  status: z.enum(["BEKLIYOR", "TAMAMLANDI"]),
});

export async function PATCH(req: Request) {
  const s = await apiSession();
  if (!s || !s.orgId) return NextResponse.json({ error: "Yetkiniz yok" }, { status: 403 });

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Geçersiz veri" }, { status: 400 });
  const { id, status } = parsed.data;

  const task = await prisma.dataTask.findUnique({ where: { id }, include: { unit: { select: { name: true } } } });
  if (!task || (s.role !== "SUPER_ADMIN" && task.orgId !== s.orgId))
    return NextResponse.json({ error: "Görev bulunamadı" }, { status: 404 });

  const merkez = MERKEZ_ROLLER.includes(s.role);
  const kendiBirimi = birimKisitli(s.role) && s.unitId === task.unitId;
  if (!merkez && !kendiBirimi) return NextResponse.json({ error: "Bu görevi yalnız merkez veya ilgili birim güncelleyebilir" }, { status: 403 });

  await prisma.dataTask.update({ where: { id }, data: { status } });
  await audit(s.sub, status === "TAMAMLANDI" ? "GOREV_TAMAMLA" : "GOREV_AC", "DataTask", id, `${task.unit.name} · ${task.category} · ${task.month}/${task.year}`, s.email);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const s = await apiSession(MERKEZ_ROLLER);
  if (!s || !s.orgId) return NextResponse.json({ error: "Yetkiniz yok" }, { status: 403 });

  const { id } = await req.json().catch(() => ({}));
  if (typeof id !== "string" || !id) return NextResponse.json({ error: "id gerekli" }, { status: 400 });

  const task = await prisma.dataTask.findUnique({ where: { id }, include: { unit: { select: { name: true } } } });
  if (!task || (s.role !== "SUPER_ADMIN" && task.orgId !== s.orgId))
    return NextResponse.json({ error: "Görev bulunamadı" }, { status: 404 });

  await prisma.dataTask.delete({ where: { id } });
  await audit(s.sub, "GOREV_SIL", "DataTask", id, `${task.unit.name} · ${task.category} · ${task.month}/${task.year}`, s.email);
  return NextResponse.json({ ok: true });
}
