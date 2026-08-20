import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiSession, apiOrgId } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { CREDIT_STANDARDS } from "@/lib/constants";
import { BANKA_GORUNUM_ROLLER, BANKA_YONETIM_ROLLER } from "@/lib/yetki";

/* ── karbon kredisi havuzları (banka tarafı) ── */

async function bankaOrgu(sRole: string, orgId: string) {
  const org = await prisma.organization.findUnique({ where: { id: orgId }, select: { id: true, type: true, name: true } });
  if (!org || org.type !== "KARBON_BANK") return null;
  return org;
}

/** GET — bankanın havuzları + basit portföy özeti */
export async function GET() {
  const s = await apiSession(BANKA_GORUNUM_ROLLER);
  if (!s) return NextResponse.json({ error: "Yetkiniz yok" }, { status: 403 });
  const orgId = await apiOrgId(s);
  if (!orgId) return NextResponse.json({ error: "Kurum bulunamadı" }, { status: 400 });
  const org = await bankaOrgu(s.role, orgId);
  if (!org) return NextResponse.json({ error: "Bu uç yalnız karbon bankası kurumları içindir" }, { status: 403 });

  const pools = await prisma.creditPool.findMany({
    where: { bankOrgId: orgId },
    include: { _count: { select: { transactions: true } } },
    orderBy: [{ active: "desc" }, { createdAt: "desc" }],
  });
  return NextResponse.json({ pools });
}

const createSchema = z.object({
  projectName: z.string().min(3, "Proje adı en az 3 karakter").max(200),
  standard: z.enum(CREDIT_STANDARDS),
  vintageYear: z.number().int().min(2000).max(2100),
  totalTCO2e: z.number().positive("Kapasite pozitif olmalı"),
  priceTRYPerTon: z.number().positive("Fiyat pozitif olmalı"),
});

/** POST — yeni havuz; kullanılabilir bakiye kapasiteyle başlar. */
export async function POST(req: Request) {
  const s = await apiSession(BANKA_YONETIM_ROLLER);
  if (!s) return NextResponse.json({ error: "Yetkiniz yok" }, { status: 403 });
  const orgId = await apiOrgId(s);
  if (!orgId) return NextResponse.json({ error: "Kurum bulunamadı" }, { status: 400 });
  const org = await bankaOrgu(s.role, orgId);
  if (!org) return NextResponse.json({ error: "Bu uç yalnız karbon bankası kurumları içindir" }, { status: 403 });

  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Geçersiz veri" }, { status: 400 });
  const d = parsed.data;

  const pool = await prisma.creditPool.create({
    data: {
      bankOrgId: orgId, projectName: d.projectName.trim(), standard: d.standard,
      vintageYear: d.vintageYear, totalTCO2e: d.totalTCO2e, availableTCO2e: d.totalTCO2e,
      priceTRYPerTon: d.priceTRYPerTon,
    },
  });
  await audit(s.sub, "HAVUZ_EKLE", "CreditPool", pool.id, `${pool.projectName} · ${pool.totalTCO2e} tCO₂e · ${pool.priceTRYPerTon} ₺/t`, s.email);
  return NextResponse.json({ ok: true, id: pool.id }, { status: 201 });
}

const patchSchema = z.object({
  id: z.string().min(1),
  projectName: z.string().min(3).max(200).optional(),
  priceTRYPerTon: z.number().positive("Fiyat pozitif olmalı").optional(),
  /** kapasite artırımı — tCO₂e ekler (hem toplam hem kullanılabilir) */
  ekKapasiteTCO2e: z.number().positive().optional(),
  active: z.boolean().optional(),
});

/** PATCH — havuz günceller; active=false vitrinden kaldırır (mevcut işlemler korunur). */
export async function PATCH(req: Request) {
  const s = await apiSession(BANKA_YONETIM_ROLLER);
  if (!s) return NextResponse.json({ error: "Yetkiniz yok" }, { status: 403 });
  const orgId = await apiOrgId(s);
  if (!orgId) return NextResponse.json({ error: "Kurum bulunamadı" }, { status: 400 });
  const org = await bankaOrgu(s.role, orgId);
  if (!org) return NextResponse.json({ error: "Bu uç yalnız karbon bankası kurumları içindir" }, { status: 403 });

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Geçersiz veri" }, { status: 400 });
  const { id, ekKapasiteTCO2e, ...d } = parsed.data;

  const pool = await prisma.creditPool.findUnique({ where: { id }, select: { bankOrgId: true, projectName: true } });
  if (!pool || pool.bankOrgId !== orgId) return NextResponse.json({ error: "Havuz bulunamadı" }, { status: 404 });

  await prisma.creditPool.update({
    where: { id },
    data: {
      ...(d.projectName !== undefined ? { projectName: d.projectName.trim() } : {}),
      ...(d.priceTRYPerTon !== undefined ? { priceTRYPerTon: d.priceTRYPerTon } : {}),
      ...(d.active !== undefined ? { active: d.active } : {}),
      ...(ekKapasiteTCO2e
        ? { totalTCO2e: { increment: ekKapasiteTCO2e }, availableTCO2e: { increment: ekKapasiteTCO2e } }
        : {}),
    },
  });
  await audit(
    s.sub,
    d.active === false ? "HAVUZ_PASIF" : "HAVUZ_GUNCELLE",
    "CreditPool",
    id,
    `${pool.projectName}${ekKapasiteTCO2e ? ` · +${ekKapasiteTCO2e} tCO₂e kapasite` : ""}${d.active === false ? " · vitrinden kaldırıldı" : ""}`,
    s.email
  );
  return NextResponse.json({ ok: true });
}
