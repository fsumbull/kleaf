import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiSession } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { CATEGORY_CODES, categoryMeta, type CategoryCode } from "@/lib/constants";

const factorValue = z
  .number({ message: "Geçerli bir sayı girin" })
  .min(0.0001, "Faktör 0.0001'den küçük olamaz")
  .max(10000, "Faktör 10000'den büyük olamaz");

const schema = z.object({
  category: z.enum(CATEGORY_CODES),
  kgCO2ePerUnit: factorValue,
  source: z.string().min(1, "Kaynak belirtin").max(200),
  year: z.number().int().min(1990).max(2100),
});

/** Kuruma özel emisyon faktörü tanımlar — küresel varsayılanı geçersiz kılar. */
export async function POST(req: Request) {
  const session = await apiSession(["SUPER_ADMIN", "IKLIM_MERKEZI"]);
  if (!session) return NextResponse.json({ error: "Yetkiniz yok" }, { status: 403 });
  if (!session.orgId && session.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Kurum bulunamadı" }, { status: 400 });
  }

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Geçersiz veri" }, { status: 400 });
  }
  const d = parsed.data;

  // süper admin etkin kurumu body ile belirtir
  const orgId = session.orgId ?? (typeof body.orgId === "string" ? body.orgId : null);
  if (!orgId) return NextResponse.json({ error: "Kurum belirtilmedi" }, { status: 400 });

  const meta = categoryMeta(d.category as CategoryCode);
  const created = await prisma.emissionFactor.create({
    data: {
      category: d.category,
      unit: meta.unit,
      kgCO2ePerUnit: d.kgCO2ePerUnit,
      source: d.source,
      year: d.year,
      scope: meta.scope,
      orgId,
    },
  });
  await audit(session.sub, "FAKTOR_EKLE", "EmissionFactor", created.id, `${d.category}=${d.kgCO2ePerUnit}`, session.email);
  return NextResponse.json({ ok: true, id: created.id }, { status: 201 });
}

const patchSchema = z.object({
  id: z.string().min(1),
  kgCO2ePerUnit: factorValue.optional(),
  source: z.string().min(1, "Kaynak belirtin").max(200).optional(),
  year: z.number().int().min(1990).max(2100).optional(),
});

/** Kurum faktörünü günceller — geçmiş onayları etkilemez (snapshot), sonraki onaylarda geçerlidir. */
export async function PATCH(req: Request) {
  const session = await apiSession(["SUPER_ADMIN", "IKLIM_MERKEZI"]);
  if (!session) return NextResponse.json({ error: "Yetkiniz yok" }, { status: 403 });

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Geçersiz veri" }, { status: 400 });
  }
  const { id, ...d } = parsed.data;

  const factor = await prisma.emissionFactor.findUnique({ where: { id } });
  if (!factor || factor.orgId === null) {
    return NextResponse.json({ error: "Faktör bulunamadı ya da küresel faktör düzenlenemez" }, { status: 404 });
  }
  if (session.role !== "SUPER_ADMIN" && factor.orgId !== session.orgId) {
    return NextResponse.json({ error: "Yetkiniz yok" }, { status: 403 });
  }

  await prisma.emissionFactor.update({ where: { id }, data: d });
  await audit(
    session.sub, "FAKTOR_GUNCELLE", "EmissionFactor", id,
    `${factor.category}${d.kgCO2ePerUnit !== undefined ? ` ${factor.kgCO2ePerUnit}→${d.kgCO2ePerUnit}` : ""}`, session.email
  );
  return NextResponse.json({ ok: true });
}

const deleteSchema = z.object({ id: z.string().min(1) });

/** Kuruma özel faktörü kaldırır (küresel faktörler silinemez). */
export async function DELETE(req: Request) {
  const session = await apiSession(["SUPER_ADMIN", "IKLIM_MERKEZI"]);
  if (!session) return NextResponse.json({ error: "Yetkiniz yok" }, { status: 403 });

  const parsed = deleteSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Geçersiz istek" }, { status: 400 });

  const factor = await prisma.emissionFactor.findUnique({ where: { id: parsed.data.id } });
  if (!factor || factor.orgId === null) {
    return NextResponse.json({ error: "Faktör bulunamadı ya da küresel faktör silinemez" }, { status: 404 });
  }
  if (session.role !== "SUPER_ADMIN" && factor.orgId !== session.orgId) {
    return NextResponse.json({ error: "Yetkiniz yok" }, { status: 403 });
  }

  await prisma.emissionFactor.delete({ where: { id: factor.id } });
  await audit(session.sub, "FAKTOR_SIL", "EmissionFactor", factor.id, factor.category, session.email);
  return NextResponse.json({ ok: true });
}
