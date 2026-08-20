/* Harici ölçüm ingest API — Bearer API anahtarıyla TASLAK kayıt açar (sayaç/SCADA entegrasyonu) */
import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { CATEGORY_CODES, categoryMeta, type CategoryCode } from "@/lib/constants";
import { donemKilitli, DONEM_KILIT_MESAJI } from "@/lib/donem";
import { rateLimited, registerFailure } from "@/lib/rate-limit";

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

const schema = z.object({
  facilityId: z.string().min(1),
  year: z.number().int().min(2000).max(2100),
  month: z.number().int().min(1).max(12),
  category: z.enum(CATEGORY_CODES),
  amount: z.number().min(0),
  documentRef: z.string().max(200).optional(),
});

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  const blocked = rateLimited(`olcum:${ip}`);
  if (blocked !== null) {
    return NextResponse.json({ error: `Çok fazla hatalı deneme — ${blocked} sn sonra tekrar deneyin` }, { status: 429 });
  }

  const auth = req.headers.get("authorization") ?? "";
  const raw = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!raw) return NextResponse.json({ error: "Bearer API anahtarı gerekli" }, { status: 401 });

  const key = await prisma.apiKey.findUnique({ where: { keyHash: sha256(raw) } });
  if (!key || !key.active) {
    registerFailure(`olcum:${ip}`);
    return NextResponse.json({ error: "Geçersiz veya pasif API anahtarı" }, { status: 401 });
  }

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Geçersiz veri" }, { status: 400 });
  }
  const d = parsed.data;

  const facility = await prisma.facility.findUnique({ where: { id: d.facilityId }, select: { orgId: true } });
  if (!facility || facility.orgId !== key.orgId) {
    return NextResponse.json({ error: "Tesis bulunamadı" }, { status: 404 });
  }
  if (await donemKilitli(key.orgId, d.year, d.month)) {
    return NextResponse.json({ error: DONEM_KILIT_MESAJI }, { status: 403 });
  }

  const meta = categoryMeta(d.category as CategoryCode);
  try {
    const created = await prisma.activityData.create({
      data: {
        facilityId: d.facilityId, vehicleKey: "", year: d.year, month: d.month,
        category: d.category, amount: d.amount, unit: meta.unit,
        documentRef: d.documentRef ?? `API:${key.prefix}`,
        status: "TASLAK", createdById: null,
      },
    });
    await prisma.apiKey.update({ where: { id: key.id }, data: { lastUsedAt: new Date() } });
    return NextResponse.json({ ok: true, id: created.id, status: "TASLAK" }, { status: 201 });
  } catch (e: unknown) {
    if (typeof e === "object" && e && "code" in e && (e as { code: string }).code === "P2002") {
      return NextResponse.json({ error: "Bu tesis + dönem + kategori için zaten kayıt var" }, { status: 409 });
    }
    throw e;
  }
}
