/* API anahtarı yönetimi — sha256 özetli, prefix ile tanımlı anahtarlar */
import { NextResponse } from "next/server";
import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiSession, getScope } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { SISTEM_ROLLER } from "@/lib/yetki";

export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

/** Yeni anahtar üret — düz metin yalnız bir kez döner. */
export async function POST(req: Request) {
  const session = await apiSession(SISTEM_ROLLER);
  if (!session) return NextResponse.json({ error: "Yetkiniz yok" }, { status: 403 });

  const parsed = z.object({ name: z.string().min(2).max(60) }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Anahtar adı 2-60 karakter olmalı" }, { status: 400 });

  const { org } = await getScope();
  const raw = `kk_${randomBytes(24).toString("hex")}`;
  const key = await prisma.apiKey.create({
    data: { orgId: org.id, name: parsed.data.name, prefix: raw.slice(0, 11), keyHash: sha256(raw), active: true },
  });
  await audit(session.sub, "API_ANAHTAR_OLUSTUR", "ApiKey", key.id, parsed.data.name, session.email);
  return NextResponse.json({ ok: true, id: key.id, key: raw }, { status: 201 });
}

/** Anahtarı pasifleştir/aktifleştir veya sil. */
export async function PATCH(req: Request) {
  const session = await apiSession(SISTEM_ROLLER);
  if (!session) return NextResponse.json({ error: "Yetkiniz yok" }, { status: 403 });

  const parsed = z.object({ id: z.string().min(1), active: z.boolean() }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Geçersiz veri" }, { status: 400 });

  const key = await prisma.apiKey.findUnique({ where: { id: parsed.data.id } });
  if (!key || (session.role !== "SUPER_ADMIN" && key.orgId !== session.orgId)) {
    return NextResponse.json({ error: "Anahtar bulunamadı" }, { status: 404 });
  }
  await prisma.apiKey.update({ where: { id: key.id }, data: { active: parsed.data.active } });
  await audit(session.sub, parsed.data.active ? "API_ANAHTAR_AKTIF" : "API_ANAHTAR_PASIF", "ApiKey", key.id, key.name, session.email);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const session = await apiSession(SISTEM_ROLLER);
  if (!session) return NextResponse.json({ error: "Yetkiniz yok" }, { status: 403 });

  const { id } = await req.json().catch(() => ({}));
  if (typeof id !== "string" || !id) return NextResponse.json({ error: "id gerekli" }, { status: 400 });
  const key = await prisma.apiKey.findUnique({ where: { id } });
  if (!key || (session.role !== "SUPER_ADMIN" && key.orgId !== session.orgId)) {
    return NextResponse.json({ error: "Anahtar bulunamadı" }, { status: 404 });
  }
  await prisma.apiKey.delete({ where: { id } });
  await audit(session.sub, "API_ANAHTAR_SIL", "ApiKey", id, key.name, session.email);
  return NextResponse.json({ ok: true });
}
