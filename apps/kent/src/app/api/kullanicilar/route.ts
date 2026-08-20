import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { apiSession } from "@/lib/auth";
import { audit } from "@/lib/audit";

const passwordPolicy = z
  .string()
  .min(10, "Parola en az 10 karakter olmalı")
  .max(100)
  .regex(/\p{L}/u, "Parola en az bir harf içermeli")
  .regex(/\d/, "Parola en az bir rakam içermeli");

const ASSIGNABLE_ROLES = [
  "UST_YONETIM", "IKLIM_MERKEZI", "MUDURLUK_VERI", "MUDURLUK_ONAY",
  "ENERJI_YONETICISI", "FILO_YONETICISI", "ATIK_UZMANI", "CBS_UZMANI",
  "MALI_HIZMETLER", "SISTEM_YONETICISI",
] as const;

/** Birim kısıtlı roller müdürlük ataması gerektirir */
const UNIT_SCOPED = new Set(["MUDURLUK_VERI", "MUDURLUK_ONAY"]);

const createSchema = z.object({
  name: z.string().min(2).max(120),
  email: z.string().email().max(200),
  password: passwordPolicy,
  role: z.enum(ASSIGNABLE_ROLES),
  orgId: z.string().min(1),
  unitId: z.string().min(1).nullable().optional(),
});

export async function POST(req: Request) {
  const s = await apiSession(["SUPER_ADMIN", "SISTEM_YONETICISI"]);
  if (!s) return NextResponse.json({ error: "Yetkisiz" }, { status: 403 });

  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Geçersiz veri (parola: en az 10 karakter, 1 harf, 1 rakam)" },
      { status: 400 }
    );
  const d = parsed.data;

  // sistem yöneticisi yalnızca kendi kurumuna kullanıcı ekleyebilir
  if (s.role !== "SUPER_ADMIN" && d.orgId !== s.orgId)
    return NextResponse.json({ error: "Yetkisiz kurum" }, { status: 403 });

  if (UNIT_SCOPED.has(d.role) && !d.unitId)
    return NextResponse.json({ error: "Bu rol için müdürlük seçimi zorunlu" }, { status: 400 });
  if (d.unitId) {
    const unit = await prisma.unit.findUnique({ where: { id: d.unitId }, select: { orgId: true } });
    if (!unit || unit.orgId !== d.orgId)
      return NextResponse.json({ error: "Müdürlük bulunamadı" }, { status: 404 });
  }

  const exists = await prisma.user.findUnique({ where: { email: d.email.toLowerCase() } });
  if (exists) return NextResponse.json({ error: "Bu e-posta zaten kayıtlı" }, { status: 409 });

  const user = await prisma.user.create({
    data: {
      name: d.name,
      email: d.email.toLowerCase(),
      passwordHash: await bcrypt.hash(d.password, 10),
      role: d.role,
      orgId: d.orgId,
      unitId: d.unitId ?? null,
    },
  });
  await audit(s.sub, "KULLANICI_OLUSTUR", "User", user.id, `${user.email} (${user.role})`);
  return NextResponse.json({ ok: true, id: user.id });
}

const patchSchema = z.object({
  id: z.string().min(1),
  role: z.enum(ASSIGNABLE_ROLES).optional(),
  unitId: z.string().min(1).nullable().optional(),
  password: passwordPolicy.optional(),
  active: z.boolean().optional(),
});

export async function PATCH(req: Request) {
  const s = await apiSession(["SUPER_ADMIN", "SISTEM_YONETICISI"]);
  if (!s) return NextResponse.json({ error: "Yetkisiz" }, { status: 403 });

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Geçersiz veri" },
      { status: 400 }
    );
  const { id, role, unitId, password, active } = parsed.data;

  if (active === false && id === s.sub)
    return NextResponse.json({ error: "Kendi hesabınızı pasifleştiremezsiniz" }, { status: 400 });

  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) return NextResponse.json({ error: "Bulunamadı" }, { status: 404 });
  if (target.role === "SUPER_ADMIN") return NextResponse.json({ error: "Süper admin düzenlenemez" }, { status: 403 });
  if (s.role !== "SUPER_ADMIN" && target.orgId !== s.orgId)
    return NextResponse.json({ error: "Yetkisiz kurum" }, { status: 403 });

  await prisma.user.update({
    where: { id },
    data: {
      ...(role ? { role } : {}),
      ...(unitId !== undefined ? { unitId } : {}),
      ...(password ? { passwordHash: await bcrypt.hash(password, 10) } : {}),
      ...(active !== undefined ? { active } : {}),
    },
  });
  const detay = [
    role ? `rol → ${role}` : null,
    password ? "parola sıfırlandı" : null,
    active !== undefined ? (active ? "aktifleştirildi" : "pasifleştirildi") : null,
  ]
    .filter(Boolean)
    .join(", ");
  await audit(s.sub, "KULLANICI_GUNCELLE", "User", id, detay || "güncellendi", s.email);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const s = await apiSession(["SUPER_ADMIN", "SISTEM_YONETICISI"]);
  if (!s) return NextResponse.json({ error: "Yetkisiz" }, { status: 403 });

  const { id } = await req.json().catch(() => ({}));
  if (typeof id !== "string" || !id) return NextResponse.json({ error: "Geçersiz istek" }, { status: 400 });
  if (id === s.sub) return NextResponse.json({ error: "Kendi hesabınızı silemezsiniz" }, { status: 400 });

  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) return NextResponse.json({ error: "Bulunamadı" }, { status: 404 });
  if (target.role === "SUPER_ADMIN") return NextResponse.json({ error: "Süper admin silinemez" }, { status: 403 });
  if (s.role !== "SUPER_ADMIN" && target.orgId !== s.orgId)
    return NextResponse.json({ error: "Yetkisiz kurum" }, { status: 403 });

  await prisma.user.delete({ where: { id } });
  await audit(s.sub, "KULLANICI_SIL", "User", id, target.email);
  return NextResponse.json({ ok: true });
}
