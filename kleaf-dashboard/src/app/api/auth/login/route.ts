import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { rateLimited, registerFailure, resetFailures } from "@/lib/rate-limit";
import { createSessionToken, SESSION_COOKIE, sessionCookieOptions } from "@/lib/session";
import type { Role } from "@/lib/constants";

const bodySchema = z.object({
  email: z.string().email("Geçerli bir e-posta girin"),
  password: z.string().min(1, "Şifre gerekli"),
});

export async function POST(req: Request) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "E-posta ve şifre gerekli" }, { status: 400 });
  }
  const email = parsed.data.email.toLowerCase().trim();
  const { password } = parsed.data;

  // kaba kuvvet koruması: e-posta + IP başına 5 deneme / 15 dk
  const ip = (req.headers.get("x-forwarded-for") ?? "local").split(",")[0].trim();
  const rlKey = `${email}|${ip}`;
  const blockedFor = rateLimited(rlKey);
  if (blockedFor !== null) {
    return NextResponse.json(
      { error: `Çok fazla başarısız deneme — ${Math.ceil(blockedFor / 60)} dakika sonra tekrar deneyin` },
      { status: 429 }
    );
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !bcrypt.compareSync(password, user.passwordHash)) {
    registerFailure(rlKey);
    await audit(user?.id ?? null, "GIRIS_BASARISIZ", "User", user?.id ?? null, `${email} (hatalı kimlik)`, email);
    return NextResponse.json({ error: "E-posta veya şifre hatalı" }, { status: 401 });
  }
  if (!user.active) {
    await audit(user.id, "GIRIS_BASARISIZ", "User", user.id, `${email} (pasif hesap)`, email);
    return NextResponse.json({ error: "Hesabınız pasif durumda — yöneticinize başvurun" }, { status: 403 });
  }

  const token = await createSessionToken({
    sub: user.id, email: user.email, name: user.name,
    role: user.role as Role, orgId: user.orgId, unitId: user.unitId,
  });

  resetFailures(rlKey);
  await audit(user.id, "GIRIS", "User", user.id, user.email, user.email);

  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions);
  return res;
}
