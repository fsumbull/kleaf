import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiSession } from "@/lib/auth";
import { audit } from "@/lib/audit";

const schema = z.object({
  orgId: z.string().min(1),
  name: z.string().min(2, "Ad en az 2 karakter").max(120),
  params: z.object({
    gesKwp: z.number().min(0).max(100000),
    filoElektrifikasyonPct: z.number().min(0).max(100),
    binaVerimlilikPct: z.number().min(0).max(100),
    ledDonusumPct: z.number().min(0).max(100).optional(),
    yalitimPct: z.number().min(0).max(100).optional(),
    kazanPct: z.number().min(0).max(100).optional(),
    kompostSaptirmaPct: z.number().min(0).max(100).optional(),
    ayristirmaArtisiPct: z.number().min(0).max(100).optional(),
    topluTasimaPct: z.number().min(0).max(100).optional(),
    capexTRY: z.number().min(0).optional(),
  }),
});

export async function POST(req: Request) {
  const session = await apiSession(["SUPER_ADMIN", "IKLIM_MERKEZI", "MALI_HIZMETLER", "ENERJI_YONETICISI"]);
  if (!session) return NextResponse.json({ error: "Yetkiniz yok" }, { status: 403 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Geçersiz veri" }, { status: 400 });
  }
  const d = parsed.data;
  if (session.role !== "SUPER_ADMIN" && d.orgId !== session.orgId) {
    return NextResponse.json({ error: "Yetkiniz yok" }, { status: 403 });
  }

  const created = await prisma.scenario.create({
    data: { orgId: d.orgId, name: d.name, params: JSON.stringify(d.params) },
  });
  await audit(session.sub, "SENARYO_KAYDET", "Scenario", created.id, d.name, session.email);
  return NextResponse.json({ ok: true, id: created.id }, { status: 201 });
}

const patchSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(2, "Ad en az 2 karakter").max(120),
});

/** Kayıtlı senaryoyu yeniden adlandırır. */
export async function PATCH(req: Request) {
  const session = await apiSession(["SUPER_ADMIN", "IKLIM_MERKEZI", "MALI_HIZMETLER", "ENERJI_YONETICISI"]);
  if (!session) return NextResponse.json({ error: "Yetkiniz yok" }, { status: 403 });

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Geçersiz veri" }, { status: 400 });
  }

  const sc = await prisma.scenario.findUnique({ where: { id: parsed.data.id }, select: { orgId: true, name: true } });
  if (!sc || (session.role !== "SUPER_ADMIN" && sc.orgId !== session.orgId)) {
    return NextResponse.json({ error: "Senaryo bulunamadı" }, { status: 404 });
  }

  await prisma.scenario.update({ where: { id: parsed.data.id }, data: { name: parsed.data.name.trim() } });
  await audit(session.sub, "SENARYO_GUNCELLE", "Scenario", parsed.data.id, `${sc.name} → ${parsed.data.name.trim()}`, session.email);
  return NextResponse.json({ ok: true });
}

const deleteSchema = z.object({ id: z.string().min(1) });

export async function DELETE(req: Request) {
  const session = await apiSession(["SUPER_ADMIN", "IKLIM_MERKEZI", "MALI_HIZMETLER", "ENERJI_YONETICISI"]);
  if (!session) return NextResponse.json({ error: "Yetkiniz yok" }, { status: 403 });

  const parsed = deleteSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Geçersiz istek" }, { status: 400 });

  const sc = await prisma.scenario.findUnique({ where: { id: parsed.data.id }, select: { orgId: true, name: true } });
  if (!sc || (session.role !== "SUPER_ADMIN" && sc.orgId !== session.orgId)) {
    return NextResponse.json({ error: "Senaryo bulunamadı" }, { status: 404 });
  }

  await prisma.scenario.delete({ where: { id: parsed.data.id } });
  await audit(session.sub, "SENARYO_SIL", "Scenario", parsed.data.id, sc.name);
  return NextResponse.json({ ok: true });
}
