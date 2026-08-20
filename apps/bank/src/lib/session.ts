/* Oturum belirteci yardımcıları — edge (middleware) uyumlu: yalnız jose kullanır. */
import { SignJWT, jwtVerify } from "jose";
import type { Role } from "./constants";

export const SESSION_COOKIE = "kleaf_session";
const MAX_AGE_S = 60 * 60 * 12; // 12 saat

const secret = () =>
  new TextEncoder().encode(process.env.AUTH_SECRET ?? "kleaf-dev-gizli-anahtar-2026");

export interface Session {
  sub: string; // user id
  email: string;
  name: string;
  role: Role;
  orgId: string | null;
  unitId: string | null; // müdürlük kapsamı (birim kısıtlı roller için)
}

export async function createSessionToken(s: Session): Promise<string> {
  return new SignJWT({ email: s.email, name: s.name, role: s.role, orgId: s.orgId, unitId: s.unitId })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(s.sub)
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_S}s`)
    .sign(secret());
}

export async function verifySessionToken(token: string): Promise<Session | null> {
  try {
    const { payload } = await jwtVerify(token, secret());
    if (!payload.sub) return null;
    return {
      sub: payload.sub,
      email: String(payload.email ?? ""),
      name: String(payload.name ?? ""),
      role: payload.role as Role,
      orgId: (payload.orgId as string | null) ?? null,
      unitId: (payload.unitId as string | null) ?? null,
    };
  } catch {
    return null;
  }
}

export const sessionCookieOptions = {
  httpOnly: true as const,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: MAX_AGE_S,
};
