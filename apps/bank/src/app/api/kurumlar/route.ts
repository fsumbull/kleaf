import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiSession } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { ORG_TYPES } from "@/lib/constants";

const createSchema = z.object({
  name: z.string().min(2).max(120),
  type: z.enum(ORG_TYPES),
  baselineYear: z.number().int().min(2000).max(2100),
  netZeroYear: z.number().int().min(2001).max(2100),
});

export async function POST(req: Request) {
  const s = await apiSession(["SUPER_ADMIN"]);
  if (!s) return NextResponse.json({ error: "Yetkisiz" }, { status: 403 });

  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Geçersiz veri" }, { status: 400 });
  const d = parsed.data;
  if (d.netZeroYear <= d.baselineYear)
    return NextResponse.json({ error: "Net-sıfır yılı baz yıldan büyük olmalı" }, { status: 400 });

  const org = await prisma.organization.create({ data: d });
  await audit(s.sub, "KURUM_OLUSTUR", "Organization", org.id, org.name);
  return NextResponse.json({ ok: true, id: org.id });
}

const patchSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(2).max(120).optional(),
  type: z.enum(ORG_TYPES).optional(),
});

export async function PATCH(req: Request) {
  const s = await apiSession(["SUPER_ADMIN"]);
  if (!s) return NextResponse.json({ error: "Yetkisiz" }, { status: 403 });

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Geçersiz veri" }, { status: 400 });
  const { id, ...data } = parsed.data;

  await prisma.organization.update({ where: { id }, data });
  await audit(s.sub, "KURUM_GUNCELLE", "Organization", id);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const s = await apiSession(["SUPER_ADMIN"]);
  if (!s) return NextResponse.json({ error: "Yetkisiz" }, { status: 403 });

  const { id } = await req.json().catch(() => ({}));
  if (typeof id !== "string" || !id) return NextResponse.json({ error: "Geçersiz istek" }, { status: 400 });

  const count = await prisma.organization.count();
  if (count <= 1) return NextResponse.json({ error: "Son kurum silinemez" }, { status: 400 });

  const org = await prisma.organization.delete({ where: { id } });
  await audit(s.sub, "KURUM_SIL", "Organization", id, org.name);
  return NextResponse.json({ ok: true });
}
