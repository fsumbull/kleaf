import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiSession } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { VEHICLE_TYPES, FUEL_TYPES } from "@/lib/constants";

const createSchema = z.object({
  orgId: z.string().min(1),
  facilityId: z.string().min(1).optional().nullable(),
  plateNo: z.string().min(2, "Plaka en az 2 karakter").max(20),
  name: z.string().max(120).optional().nullable(),
  vehicleType: z.enum(VEHICLE_TYPES),
  fuelType: z.enum(FUEL_TYPES),
  modelYear: z.number().int().min(1980).max(2035).optional().nullable(),
});

export async function POST(req: Request) {
  const s = await apiSession(["SUPER_ADMIN", "IKLIM_MERKEZI", "FILO_YONETICISI"]);
  if (!s) return NextResponse.json({ error: "Yetkiniz yok" }, { status: 403 });

  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Geçersiz veri" }, { status: 400 });
  const d = parsed.data;
  if (s.role !== "SUPER_ADMIN" && d.orgId !== s.orgId)
    return NextResponse.json({ error: "Yetkisiz kurum" }, { status: 403 });

  if (d.facilityId) {
    const fac = await prisma.facility.findUnique({ where: { id: d.facilityId }, select: { orgId: true } });
    if (!fac || fac.orgId !== d.orgId) return NextResponse.json({ error: "Tesis bulunamadı" }, { status: 404 });
  }

  try {
    const v = await prisma.vehicle.create({
      data: {
        orgId: d.orgId, facilityId: d.facilityId ?? null,
        plateNo: d.plateNo.trim().toUpperCase(), name: d.name?.trim() || null,
        vehicleType: d.vehicleType, fuelType: d.fuelType, modelYear: d.modelYear ?? null,
      },
    });
    await audit(s.sub, "ARAC_EKLE", "Vehicle", v.id, `${v.plateNo} (${v.vehicleType}/${v.fuelType})`);
    return NextResponse.json({ ok: true, id: v.id }, { status: 201 });
  } catch (e: unknown) {
    if (typeof e === "object" && e && "code" in e && (e as { code: string }).code === "P2002")
      return NextResponse.json({ error: "Bu plaka zaten kayıtlı" }, { status: 409 });
    throw e;
  }
}

const patchSchema = z.object({
  id: z.string().min(1),
  facilityId: z.string().min(1).optional().nullable(),
  plateNo: z.string().min(2).max(20).optional(),
  name: z.string().max(120).optional().nullable(),
  vehicleType: z.enum(VEHICLE_TYPES).optional(),
  fuelType: z.enum(FUEL_TYPES).optional(),
  modelYear: z.number().int().min(1980).max(2035).optional().nullable(),
  active: z.boolean().optional(),
});

export async function PATCH(req: Request) {
  const s = await apiSession(["SUPER_ADMIN", "IKLIM_MERKEZI", "FILO_YONETICISI"]);
  if (!s) return NextResponse.json({ error: "Yetkiniz yok" }, { status: 403 });

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Geçersiz veri" }, { status: 400 });
  const { id, ...d } = parsed.data;

  const target = await prisma.vehicle.findUnique({ where: { id }, select: { orgId: true, plateNo: true } });
  if (!target || (s.role !== "SUPER_ADMIN" && target.orgId !== s.orgId))
    return NextResponse.json({ error: "Araç bulunamadı" }, { status: 404 });

  try {
    await prisma.vehicle.update({
      where: { id },
      data: {
        ...(d.plateNo !== undefined ? { plateNo: d.plateNo.trim().toUpperCase() } : {}),
        ...(d.name !== undefined ? { name: d.name?.trim() || null } : {}),
        ...(d.vehicleType !== undefined ? { vehicleType: d.vehicleType } : {}),
        ...(d.fuelType !== undefined ? { fuelType: d.fuelType } : {}),
        ...(d.modelYear !== undefined ? { modelYear: d.modelYear } : {}),
        ...(d.facilityId !== undefined ? { facilityId: d.facilityId } : {}),
        ...(d.active !== undefined ? { active: d.active } : {}),
      },
    });
    await audit(s.sub, "ARAC_GUNCELLE", "Vehicle", id, target.plateNo);
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    if (typeof e === "object" && e && "code" in e && (e as { code: string }).code === "P2002")
      return NextResponse.json({ error: "Bu plaka zaten kayıtlı" }, { status: 409 });
    throw e;
  }
}

export async function DELETE(req: Request) {
  const s = await apiSession(["SUPER_ADMIN", "IKLIM_MERKEZI", "FILO_YONETICISI"]);
  if (!s) return NextResponse.json({ error: "Yetkiniz yok" }, { status: 403 });

  const { id } = await req.json().catch(() => ({}));
  if (typeof id !== "string" || !id) return NextResponse.json({ error: "Geçersiz istek" }, { status: 400 });

  const target = await prisma.vehicle.findUnique({
    where: { id },
    select: { orgId: true, plateNo: true, _count: { select: { activityData: true } } },
  });
  if (!target || (s.role !== "SUPER_ADMIN" && target.orgId !== s.orgId))
    return NextResponse.json({ error: "Araç bulunamadı" }, { status: 404 });
  if (target._count.activityData > 0)
    return NextResponse.json({ error: "Bu araca bağlı yakıt kayıtları var — önce pasife alın" }, { status: 409 });

  await prisma.vehicle.delete({ where: { id } });
  await audit(s.sub, "ARAC_SIL", "Vehicle", id, target.plateNo);
  return NextResponse.json({ ok: true });
}
