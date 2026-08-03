/* Sunucu tarafı oturum / kapsam yardımcıları (server components + route handlers) */
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "./prisma";
import { SESSION_COOKIE, verifySessionToken, type Session } from "./session";
import type { Role } from "./constants";

export async function getSession(): Promise<Session | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

/** Oturum yoksa /giris'e yönlendirir; rol listesi verilirse yetki denetler. */
export async function requireSession(roles?: Role[]): Promise<Session> {
  const s = await getSession();
  if (!s) redirect("/giris");
  if (roles && !roles.includes(s.role)) redirect("/");
  return s;
}

export interface Scope {
  session: Session;
  org: { id: string; name: string; type: string; baselineYear: number; netZeroYear: number };
  year: number;
  /** süper admin için kurum listesi (değiştirici) */
  orgs: { id: string; name: string; type: string }[];
}

/** Oturum + etkin kurum + seçili yıl. Süper admin kurum çerezi ile gezinir. */
export async function getScope(): Promise<Scope> {
  const session = await requireSession();
  const jar = await cookies();

  let orgId = session.orgId;
  let orgs: Scope["orgs"] = [];
  if (session.role === "SUPER_ADMIN") {
    orgs = await prisma.organization.findMany({
      select: { id: true, name: true, type: true },
      orderBy: { name: "asc" },
    });
    const pick = jar.get("kleaf_org")?.value;
    orgId = (pick && orgs.some((o) => o.id === pick) ? pick : orgs[0]?.id) ?? null;
  }
  if (!orgId) redirect("/giris");

  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { id: true, name: true, type: true, baselineYear: true, netZeroYear: true },
  });
  if (!org) redirect("/giris");

  const yearRaw = Number(jar.get("kleaf_yil")?.value);
  const year = Number.isInteger(yearRaw) && yearRaw >= 2000 && yearRaw <= 2100 ? yearRaw : 2025;

  return { session, org, year, orgs };
}

/** API rotaları için: oturum yoksa/rol yetersizse hata fırlatmak yerine null döner. */
export async function apiSession(roles?: Role[]): Promise<Session | null> {
  const s = await getSession();
  if (!s) return null;
  if (roles && !roles.includes(s.role)) return null;
  return s;
}
