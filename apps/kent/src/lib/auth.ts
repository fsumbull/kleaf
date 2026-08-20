/* Sunucu tarafı oturum / kapsam yardımcıları (server components + route handlers) */
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "./prisma";
import { SESSION_COOKIE, verifySessionToken, type Session } from "./session";
import type { Role } from "./constants";
import { etkinBirim, type BirimKapsami } from "./birim";

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
  /** etkin birim kapsamı (müdürlük kilitli, admin seçilebilir) */
  birim: BirimKapsami;
  /** kurumun birim listesi (topbar seçici + filtre) */
  units: { id: string; name: string }[];
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

  const units = await prisma.unit.findMany({
    where: { orgId: org.id },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  const birim = etkinBirim(session, jar.get("kleaf_birim")?.value, units.map((u) => u.id));
  if (birim.unitId) birim.adi = units.find((u) => u.id === birim.unitId)?.name;

  return { session, org, year, orgs, birim, units };
}

/** API rotaları için: oturum yoksa/rol yetersizse hata fırlatmak yerine null döner. */
export async function apiSession(roles?: Role[]): Promise<Session | null> {
  const s = await getSession();
  if (!s) return null;
  if (roles && !roles.includes(s.role)) return null;
  return s;
}

/** API rotaları için etkin kurum kimliği — SUPER_ADMIN kurum çerezini izler, diğerleri kendi kurumu. */
export async function apiOrgId(session: Session): Promise<string | null> {
  if (session.role !== "SUPER_ADMIN") return session.orgId;
  const jar = await cookies();
  const pick = jar.get("kleaf_org")?.value;
  if (pick) {
    const ok = await prisma.organization.findUnique({ where: { id: pick }, select: { id: true } });
    if (ok) return ok.id;
  }
  const first = await prisma.organization.findFirst({ select: { id: true }, orderBy: { name: "asc" } });
  return first?.id ?? null;
}

/** API rotaları için etkin birim kapsamı — müdürlük kilitli, kurum-geneli roller kleaf_birim çerezini izler. */
export async function apiBirim(session: Session, orgId: string): Promise<BirimKapsami> {
  const jar = await cookies();
  const pick = jar.get("kleaf_birim")?.value;
  const gecerli = pick
    ? await prisma.unit.findMany({ where: { orgId }, select: { id: true } })
    : [];
  const birim = etkinBirim(session, pick, gecerli.map((u) => u.id));
  if (birim.unitId) {
    const u = await prisma.unit.findUnique({ where: { id: birim.unitId }, select: { name: true } });
    birim.adi = u?.name;
  }
  return birim;
}
