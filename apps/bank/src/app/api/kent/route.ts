import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiSession } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { CITY_SECTORS, CATEGORY_CODES } from "@/lib/constants";

/**
 * Kent envanteri yönetimi — mahalle ve sektör aktivite verisi CRUD.
 * Yalnız BELEDIYE tipi kurumlarda, yönetici rolleriyle.
 */

const mahalleSchema = z.object({
  tip: z.literal("mahalle"),
  name: z.string().min(2, "Mahalle adı en az 2 karakter").max(120),
  population: z.number({ message: "Geçerli bir nüfus girin" }).int().min(0, "Nüfus negatif olamaz").max(10_000_000),
});

const veriSchema = z.object({
  tip: z.literal("veri"),
  year: z.number().int().min(2000).max(2100),
  sector: z.enum(CITY_SECTORS),
  category: z.enum(CATEGORY_CODES),
  amount: z.number({ message: "Geçerli bir miktar girin" }).min(0, "Miktar negatif olamaz"),
  neighborhoodId: z.string().nullable().optional(),
});

/** Oturum + belediye kapsam denetimi. Süper admin body.orgId ile hedefler. */
async function kentScope(body: unknown) {
  const session = await apiSession(["SUPER_ADMIN", "IKLIM_MERKEZI", "CBS_UZMANI"]);
  if (!session) return { error: NextResponse.json({ error: "Yetkiniz yok" }, { status: 403 }) };

  const bodyOrgId = body && typeof body === "object" && "orgId" in body && typeof body.orgId === "string" ? body.orgId : null;
  const orgId = session.role === "SUPER_ADMIN" ? (bodyOrgId ?? session.orgId) : session.orgId;
  if (!orgId) return { error: NextResponse.json({ error: "Kurum belirtilmedi" }, { status: 400 }) };

  const org = await prisma.organization.findUnique({ where: { id: orgId }, select: { type: true } });
  if (!org) return { error: NextResponse.json({ error: "Kurum bulunamadı" }, { status: 404 }) };
  if (org.type !== "BELEDIYE") return { error: NextResponse.json({ error: "Kent envanteri yalnız belediyeler içindir" }, { status: 403 }) };

  return { session, orgId };
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const scope = await kentScope(body);
  if ("error" in scope) return scope.error;
  const { session, orgId } = scope;

  const parsed = z.discriminatedUnion("tip", [mahalleSchema, veriSchema]).safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Geçersiz veri" }, { status: 400 });
  const d = parsed.data;

  if (d.tip === "mahalle") {
    try {
      const created = await prisma.neighborhood.create({ data: { orgId, name: d.name.trim(), population: d.population } });
      await audit(session.sub, "MAHALLE_EKLE", "Neighborhood", created.id, d.name.trim(), session.email);
      return NextResponse.json({ ok: true, id: created.id }, { status: 201 });
    } catch {
      return NextResponse.json({ error: "Bu adla bir mahalle zaten var" }, { status: 409 });
    }
  }

  if (d.neighborhoodId) {
    const n = await prisma.neighborhood.findFirst({ where: { id: d.neighborhoodId, orgId }, select: { id: true } });
    if (!n) return NextResponse.json({ error: "Mahalle bulunamadı" }, { status: 400 });
  }
  const created = await prisma.cityActivity.create({
    data: { orgId, year: d.year, sector: d.sector, category: d.category, amount: d.amount, neighborhoodId: d.neighborhoodId ?? null },
  });
  await audit(session.sub, "KENT_VERI_EKLE", "CityActivity", created.id, `${d.year} ${d.sector}/${d.category}=${d.amount}`, session.email);
  return NextResponse.json({ ok: true, id: created.id }, { status: 201 });
}

const mahallePatch = mahalleSchema.partial().extend({ tip: z.literal("mahalle"), id: z.string().min(1) });
const veriPatch = veriSchema.partial().extend({ tip: z.literal("veri"), id: z.string().min(1) });

export async function PATCH(req: Request) {
  const body = await req.json().catch(() => null);
  const scope = await kentScope(body);
  if ("error" in scope) return scope.error;
  const { session, orgId } = scope;

  const parsed = z.discriminatedUnion("tip", [mahallePatch, veriPatch]).safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Geçersiz veri" }, { status: 400 });
  const d = parsed.data;

  if (d.tip === "mahalle") {
    const existing = await prisma.neighborhood.findFirst({ where: { id: d.id, orgId } });
    if (!existing) return NextResponse.json({ error: "Mahalle bulunamadı" }, { status: 404 });
    try {
      await prisma.neighborhood.update({
        where: { id: d.id },
        data: {
          ...(d.name !== undefined ? { name: d.name.trim() } : {}),
          ...(d.population !== undefined ? { population: d.population } : {}),
        },
      });
    } catch {
      return NextResponse.json({ error: "Bu adla bir mahalle zaten var" }, { status: 409 });
    }
    await audit(session.sub, "MAHALLE_GUNCELLE", "Neighborhood", d.id, d.name ?? existing.name, session.email);
    return NextResponse.json({ ok: true });
  }

  const existing = await prisma.cityActivity.findFirst({ where: { id: d.id, orgId } });
  if (!existing) return NextResponse.json({ error: "Kayıt bulunamadı" }, { status: 404 });
  if (d.neighborhoodId) {
    const n = await prisma.neighborhood.findFirst({ where: { id: d.neighborhoodId, orgId }, select: { id: true } });
    if (!n) return NextResponse.json({ error: "Mahalle bulunamadı" }, { status: 400 });
  }
  await prisma.cityActivity.update({
    where: { id: d.id },
    data: {
      ...(d.year !== undefined ? { year: d.year } : {}),
      ...(d.sector !== undefined ? { sector: d.sector } : {}),
      ...(d.category !== undefined ? { category: d.category } : {}),
      ...(d.amount !== undefined ? { amount: d.amount } : {}),
      ...(d.neighborhoodId !== undefined ? { neighborhoodId: d.neighborhoodId } : {}),
    },
  });
  await audit(session.sub, "KENT_VERI_GUNCELLE", "CityActivity", d.id, `${existing.year} ${existing.sector}/${existing.category}`, session.email);
  return NextResponse.json({ ok: true });
}

const deleteSchema = z.object({ tip: z.enum(["mahalle", "veri"]), id: z.string().min(1) });

export async function DELETE(req: Request) {
  const body = await req.json().catch(() => null);
  const scope = await kentScope(body);
  if ("error" in scope) return scope.error;
  const { session, orgId } = scope;

  const parsed = deleteSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Geçersiz istek" }, { status: 400 });
  const d = parsed.data;

  if (d.tip === "mahalle") {
    const existing = await prisma.neighborhood.findFirst({ where: { id: d.id, orgId } });
    if (!existing) return NextResponse.json({ error: "Mahalle bulunamadı" }, { status: 404 });
    await prisma.neighborhood.delete({ where: { id: d.id } }); // bağlı kent verileri SetNull
    await audit(session.sub, "MAHALLE_SIL", "Neighborhood", d.id, existing.name, session.email);
    return NextResponse.json({ ok: true });
  }

  const existing = await prisma.cityActivity.findFirst({ where: { id: d.id, orgId } });
  if (!existing) return NextResponse.json({ error: "Kayıt bulunamadı" }, { status: 404 });
  await prisma.cityActivity.delete({ where: { id: d.id } });
  await audit(session.sub, "KENT_VERI_SIL", "CityActivity", d.id, `${existing.year} ${existing.sector}/${existing.category}`, session.email);
  return NextResponse.json({ ok: true });
}
