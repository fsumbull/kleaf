import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiSession } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { FACILITY_TYPES } from "@/lib/constants";

const num = (min: number, max: number) => z.number().min(min).max(max).optional().nullable();

const createSchema = z.object({
  orgId: z.string().min(1),
  name: z.string().min(2, "Tesis adı en az 2 karakter").max(160),
  type: z.enum(FACILITY_TYPES),
  areaM2: num(1, 5_000_000),
  staffCount: z.number().int().min(1).max(1_000_000).optional().nullable(),
  unitId: z.string().min(1).optional().nullable(),
  // GES künyesi
  installedKwp: num(0.1, 1_000_000),
  commissionYear: z.number().int().min(1990).max(2100).optional().nullable(),
  capexTRY: num(1, 100_000_000_000),
});

async function checkUnit(unitId: string, orgId: string) {
  const u = await prisma.unit.findUnique({ where: { id: unitId }, select: { orgId: true } });
  return !!u && u.orgId === orgId;
}

export async function POST(req: Request) {
  const s = await apiSession(["SUPER_ADMIN", "IKLIM_MERKEZI", "ENERJI_YONETICISI"]);
  if (!s) return NextResponse.json({ error: "Yetkiniz yok" }, { status: 403 });

  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Geçersiz veri" }, { status: 400 });
  const d = parsed.data;
  if (s.role !== "SUPER_ADMIN" && d.orgId !== s.orgId)
    return NextResponse.json({ error: "Yetkisiz kurum" }, { status: 403 });
  if (d.unitId && !(await checkUnit(d.unitId, d.orgId)))
    return NextResponse.json({ error: "Birim bulunamadı" }, { status: 404 });

  const f = await prisma.facility.create({
    data: {
      orgId: d.orgId,
      name: d.name.trim(),
      type: d.type,
      areaM2: d.areaM2 ?? null,
      staffCount: d.staffCount ?? null,
      unitId: d.unitId ?? null,
      installedKwp: d.type === "GES" ? d.installedKwp ?? null : null,
      commissionYear: d.type === "GES" ? d.commissionYear ?? null : null,
      capexTRY: d.type === "GES" ? d.capexTRY ?? null : null,
    },
  });
  await audit(s.sub, "TESIS_EKLE", "Facility", f.id, `${f.name} (${f.type})`, s.email);
  return NextResponse.json({ ok: true, id: f.id }, { status: 201 });
}

const patchSchema = createSchema.omit({ orgId: true }).partial().extend({
  id: z.string().min(1),
});

export async function PATCH(req: Request) {
  const s = await apiSession(["SUPER_ADMIN", "IKLIM_MERKEZI", "ENERJI_YONETICISI", "CBS_UZMANI"]);
  if (!s) return NextResponse.json({ error: "Yetkiniz yok" }, { status: 403 });

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Geçersiz veri" }, { status: 400 });
  const { id, ...d } = parsed.data;

  const target = await prisma.facility.findUnique({ where: { id }, select: { orgId: true, type: true } });
  if (!target || (s.role !== "SUPER_ADMIN" && target.orgId !== s.orgId))
    return NextResponse.json({ error: "Tesis bulunamadı" }, { status: 404 });
  if (d.unitId && !(await checkUnit(d.unitId, target.orgId)))
    return NextResponse.json({ error: "Birim bulunamadı" }, { status: 404 });

  const nextType = d.type ?? target.type;
  const f = await prisma.facility.update({
    where: { id },
    data: {
      ...(d.name !== undefined ? { name: d.name.trim() } : {}),
      ...(d.type !== undefined ? { type: d.type } : {}),
      ...(d.areaM2 !== undefined ? { areaM2: d.areaM2 } : {}),
      ...(d.staffCount !== undefined ? { staffCount: d.staffCount } : {}),
      ...(d.unitId !== undefined ? { unitId: d.unitId } : {}),
      // GES dışına çevrilirse künye temizlenir
      ...(nextType !== "GES"
        ? { installedKwp: null, commissionYear: null, capexTRY: null }
        : {
            ...(d.installedKwp !== undefined ? { installedKwp: d.installedKwp } : {}),
            ...(d.commissionYear !== undefined ? { commissionYear: d.commissionYear } : {}),
            ...(d.capexTRY !== undefined ? { capexTRY: d.capexTRY } : {}),
          }),
    },
  });
  await audit(s.sub, "TESIS_GUNCELLE", "Facility", id, `${f.name} (${f.type})`, s.email);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const s = await apiSession(["SUPER_ADMIN", "IKLIM_MERKEZI"]);
  if (!s) return NextResponse.json({ error: "Yetkiniz yok" }, { status: 403 });

  const url = new URL(req.url);
  const force = url.searchParams.get("force") === "1";
  const { id } = await req.json().catch(() => ({}));
  if (typeof id !== "string" || !id) return NextResponse.json({ error: "Geçersiz istek" }, { status: 400 });

  const target = await prisma.facility.findUnique({
    where: { id },
    select: { orgId: true, name: true, _count: { select: { activityData: true, vehicles: true } } },
  });
  if (!target || (s.role !== "SUPER_ADMIN" && target.orgId !== s.orgId))
    return NextResponse.json({ error: "Tesis bulunamadı" }, { status: 404 });

  const dataCount = target._count.activityData;
  if (dataCount > 0 && !force) {
    return NextResponse.json(
      { error: `Bu tesiste ${dataCount} faaliyet kaydı var — silinirse hepsi kaybolur`, count: dataCount },
      { status: 409 }
    );
  }

  await prisma.facility.delete({ where: { id } }); // activityData cascade silinir; araçlar tesissiz kalır
  await audit(s.sub, "TESIS_SIL", "Facility", id, `${target.name} (${dataCount} kayıtla)`, s.email);
  return NextResponse.json({ ok: true });
}
