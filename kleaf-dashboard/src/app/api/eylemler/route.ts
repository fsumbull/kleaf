import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiSession } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { ACTION_STATUS } from "@/lib/constants";

const createSchema = z.object({
  orgId: z.string().min(1),
  title: z.string().min(3, "Başlık en az 3 karakter").max(200),
  description: z.string().max(2000).optional(),
  budgetTRY: z.number().min(0).nullable().optional(),
  targetReductionTCO2e: z.number().min(0, "Hedef azaltım negatif olamaz"),
  owner: z.string().max(120).optional(),
  startYear: z.number().int().min(2000).max(2100).nullable().optional(),
  unitId: z.string().nullable().optional(),
  startDate: z.string().datetime().nullable().optional(),
  endDate: z.string().datetime().nullable().optional(),
  riskNote: z.string().max(1000).nullable().optional(),
});

export async function POST(req: Request) {
  const session = await apiSession(["SUPER_ADMIN", "IKLIM_MERKEZI", "MALI_HIZMETLER"]);
  if (!session) return NextResponse.json({ error: "Yetkiniz yok" }, { status: 403 });

  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Geçersiz veri" }, { status: 400 });
  }
  const d = parsed.data;
  if (session.role !== "SUPER_ADMIN" && d.orgId !== session.orgId) {
    return NextResponse.json({ error: "Yetkiniz yok" }, { status: 403 });
  }

  if (d.unitId) {
    const unit = await prisma.unit.findUnique({ where: { id: d.unitId }, select: { orgId: true } });
    if (!unit || unit.orgId !== d.orgId) {
      return NextResponse.json({ error: "Müdürlük bulunamadı" }, { status: 404 });
    }
  }

  const created = await prisma.actionPlan.create({
    data: {
      orgId: d.orgId,
      title: d.title,
      description: d.description || null,
      budgetTRY: d.budgetTRY ?? null,
      targetReductionTCO2e: d.targetReductionTCO2e,
      owner: d.owner || null,
      startYear: d.startYear ?? null,
      unitId: d.unitId ?? null,
      startDate: d.startDate ? new Date(d.startDate) : null,
      endDate: d.endDate ? new Date(d.endDate) : null,
      riskNote: d.riskNote || null,
    },
  });
  await audit(session.sub, "EYLEM_EKLE", "ActionPlan", created.id, d.title);
  return NextResponse.json({ ok: true, id: created.id }, { status: 201 });
}

const patchSchema = z.object({
  id: z.string().min(1),
  status: z.enum(ACTION_STATUS).optional(),
  title: z.string().min(3).max(200).optional(),
  description: z.string().max(2000).nullable().optional(),
  budgetTRY: z.number().min(0).nullable().optional(),
  targetReductionTCO2e: z.number().min(0).optional(),
  owner: z.string().max(120).nullable().optional(),
  startYear: z.number().int().min(2000).max(2100).nullable().optional(),
  unitId: z.string().nullable().optional(),
  startDate: z.string().datetime().nullable().optional(),
  endDate: z.string().datetime().nullable().optional(),
  riskNote: z.string().max(1000).nullable().optional(),
});

export async function PATCH(req: Request) {
  const session = await apiSession(["SUPER_ADMIN", "IKLIM_MERKEZI", "MALI_HIZMETLER"]);
  if (!session) return NextResponse.json({ error: "Yetkiniz yok" }, { status: 403 });

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Geçersiz veri" }, { status: 400 });
  const { id, startDate, endDate, ...d } = parsed.data;

  const plan = await prisma.actionPlan.findUnique({ where: { id }, select: { orgId: true } });
  if (!plan || (session.role !== "SUPER_ADMIN" && plan.orgId !== session.orgId)) {
    return NextResponse.json({ error: "Eylem bulunamadı" }, { status: 404 });
  }

  await prisma.actionPlan.update({
    where: { id },
    data: {
      ...d,
      ...(startDate !== undefined ? { startDate: startDate ? new Date(startDate) : null } : {}),
      ...(endDate !== undefined ? { endDate: endDate ? new Date(endDate) : null } : {}),
    },
  });
  await audit(session.sub, "EYLEM_GUNCELLE", "ActionPlan", id, d.status);
  return NextResponse.json({ ok: true });
}

const deleteSchema = z.object({ id: z.string().min(1) });

export async function DELETE(req: Request) {
  const session = await apiSession(["SUPER_ADMIN", "IKLIM_MERKEZI"]);
  if (!session) return NextResponse.json({ error: "Yetkiniz yok" }, { status: 403 });

  const parsed = deleteSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Geçersiz istek" }, { status: 400 });

  const plan = await prisma.actionPlan.findUnique({ where: { id: parsed.data.id }, select: { orgId: true, title: true } });
  if (!plan || (session.role !== "SUPER_ADMIN" && plan.orgId !== session.orgId)) {
    return NextResponse.json({ error: "Eylem bulunamadı" }, { status: 404 });
  }

  await prisma.actionPlan.delete({ where: { id: parsed.data.id } });
  await audit(session.sub, "EYLEM_SIL", "ActionPlan", parsed.data.id, plan.title);
  return NextResponse.json({ ok: true });
}
