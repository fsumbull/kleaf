import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiSession } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { CATEGORY_CODES, categoryMeta, type CategoryCode } from "@/lib/constants";
import { VERI_GIRIS_ROLLER, kategoriYetkisi, birimKisitli } from "@/lib/yetki";
import { donemKilitli, DONEM_KILIT_MESAJI } from "@/lib/donem";

const createSchema = z.object({
  facilityId: z.string().min(1),
  vehicleId: z.string().min(1).optional().nullable(),
  year: z.number().int().min(2000).max(2100),
  month: z.number().int().min(1).max(12),
  category: z.enum(CATEGORY_CODES),
  amount: z.number().min(0),
  documentRef: z.string().max(200).optional().nullable(),
});

/** Yeni faaliyet kaydı (taslak olarak açılır). */
export async function POST(req: Request) {
  const session = await apiSession(VERI_GIRIS_ROLLER);
  if (!session) return NextResponse.json({ error: "Yetkiniz yok" }, { status: 403 });

  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Geçersiz veri" }, { status: 400 });
  }
  const d = parsed.data;

  if (!kategoriYetkisi(session.role, d.category))
    return NextResponse.json({ error: "Bu kategori için veri giriş yetkiniz yok" }, { status: 403 });

  const facility = await prisma.facility.findUnique({ where: { id: d.facilityId }, select: { orgId: true, unitId: true } });
  if (!facility || (session.role !== "SUPER_ADMIN" && facility.orgId !== session.orgId)) {
    return NextResponse.json({ error: "Tesis bulunamadı" }, { status: 404 });
  }
  if (birimKisitli(session.role) && facility.unitId !== session.unitId)
    return NextResponse.json({ error: "Bu tesis müdürlüğünüzün kapsamında değil" }, { status: 403 });
  if (await donemKilitli(facility.orgId, d.year, d.month))
    return NextResponse.json({ error: DONEM_KILIT_MESAJI }, { status: 403 });

  if (d.vehicleId) {
    const vehicle = await prisma.vehicle.findUnique({ where: { id: d.vehicleId }, select: { orgId: true, active: true } });
    if (!vehicle || vehicle.orgId !== facility.orgId) {
      return NextResponse.json({ error: "Araç bulunamadı" }, { status: 404 });
    }
    if (!vehicle.active) {
      return NextResponse.json({ error: "Pasif araç için kayıt girilemez — önce aracı filoda aktifleştirin" }, { status: 400 });
    }
  }

  const meta = categoryMeta(d.category as CategoryCode);
  try {
    const created = await prisma.activityData.create({
      data: {
        facilityId: d.facilityId,
        vehicleId: d.vehicleId ?? null,
        vehicleKey: d.vehicleId ?? "",
        year: d.year,
        month: d.month,
        category: d.category,
        amount: d.amount,
        unit: meta.unit,
        documentRef: d.documentRef || null,
        status: "TASLAK",
        createdById: session.sub,
      },
    });
    await audit(session.sub, "VERI_EKLE", "ActivityData", created.id, `${d.category} ${d.year}-${d.month}`, session.email);
    return NextResponse.json({ ok: true, id: created.id }, { status: 201 });
  } catch (e: unknown) {
    if (typeof e === "object" && e && "code" in e && (e as { code: string }).code === "P2002") {
      const existing = await prisma.activityData.findUnique({
        where: {
          facilityId_year_month_category_vehicleKey: {
            facilityId: d.facilityId, year: d.year, month: d.month,
            category: d.category, vehicleKey: d.vehicleId ?? "",
          },
        },
        select: { id: true },
      });
      return NextResponse.json(
        {
          error: "Bu tesis + dönem + kategori (+ araç) için zaten kayıt var.",
          existingId: existing?.id ?? null,
        },
        { status: 409 }
      );
    }
    throw e;
  }
}
