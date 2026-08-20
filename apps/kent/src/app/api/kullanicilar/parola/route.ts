import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { apiSession } from "@/lib/auth";
import { audit } from "@/lib/audit";

const schema = z.object({
  eski: z.string().min(1, "Mevcut parolanızı girin"),
  yeni: z
    .string()
    .min(10, "Yeni parola en az 10 karakter olmalı")
    .max(100)
    .regex(/\p{L}/u, "Yeni parola en az bir harf içermeli")
    .regex(/\d/, "Yeni parola en az bir rakam içermeli"),
});

/** Oturum sahibinin kendi parolasını değiştirmesi (eski parola doğrulamalı). */
export async function POST(req: Request) {
  const s = await apiSession();
  if (!s) return NextResponse.json({ error: "Oturum gerekli" }, { status: 401 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Geçersiz veri" }, { status: 400 });
  const { eski, yeni } = parsed.data;

  const user = await prisma.user.findUnique({ where: { id: s.sub }, select: { id: true, passwordHash: true } });
  if (!user) return NextResponse.json({ error: "Kullanıcı bulunamadı" }, { status: 404 });

  const ok = await bcrypt.compare(eski, user.passwordHash);
  if (!ok) return NextResponse.json({ error: "Mevcut parola hatalı" }, { status: 400 });
  if (eski === yeni) return NextResponse.json({ error: "Yeni parola eskisiyle aynı olamaz" }, { status: 400 });

  await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await bcrypt.hash(yeni, 10) } });
  await audit(s.sub, "PAROLA_DEGISTIR", "User", user.id, "kullanıcı kendi parolasını değiştirdi", s.email);
  return NextResponse.json({ ok: true });
}
