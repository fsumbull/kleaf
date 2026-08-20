import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiSession } from "@/lib/auth";
import { audit } from "@/lib/audit";

const schema = z.object({
  orgId: z.string().min(1),
  baselineYear: z.number().int().min(2000).max(2100),
  netZeroYear: z.number().int().min(2030).max(2100),
  elektrikTRYPerKwh: z.number().min(0).optional(),
  dogalgazTRYPerM3: z.number().min(0).optional(),
  dizelTRYPerL: z.number().min(0).optional(),
  atikBertarafTRYPerTon: z.number().min(0).optional(),
  enerjiTasarrufHedefiPct: z.number().min(0).max(100).optional(),
  gesKwhPerKwp: z.number().min(500, "500-2500 kWh/kWp aralığında olmalı").max(2500, "500-2500 kWh/kWp aralığında olmalı").optional(),
  gesCapexTRYPerKwp: z.number().min(0).optional(),
  portalAcik: z.boolean().optional(),
});

/** Kurumun baz yılı / net-sıfır yılı ayarları. */
export async function PUT(req: Request) {
  const session = await apiSession(["SUPER_ADMIN", "IKLIM_MERKEZI"]);
  if (!session) return NextResponse.json({ error: "Yetkiniz yok" }, { status: 403 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Geçersiz veri" }, { status: 400 });
  }
  const d = parsed.data;
  if (session.role !== "SUPER_ADMIN" && d.orgId !== session.orgId) {
    return NextResponse.json({ error: "Yetkiniz yok" }, { status: 403 });
  }
  if (d.netZeroYear <= d.baselineYear) {
    return NextResponse.json({ error: "Net-sıfır yılı baz yıldan sonra olmalı" }, { status: 400 });
  }

  await prisma.organization.update({
    where: { id: d.orgId },
    data: {
      baselineYear: d.baselineYear,
      netZeroYear: d.netZeroYear,
      ...(d.elektrikTRYPerKwh !== undefined ? { elektrikTRYPerKwh: d.elektrikTRYPerKwh } : {}),
      ...(d.dogalgazTRYPerM3 !== undefined ? { dogalgazTRYPerM3: d.dogalgazTRYPerM3 } : {}),
      ...(d.dizelTRYPerL !== undefined ? { dizelTRYPerL: d.dizelTRYPerL } : {}),
      ...(d.atikBertarafTRYPerTon !== undefined ? { atikBertarafTRYPerTon: d.atikBertarafTRYPerTon } : {}),
      ...(d.enerjiTasarrufHedefiPct !== undefined ? { enerjiTasarrufHedefiPct: d.enerjiTasarrufHedefiPct } : {}),
      ...(d.gesKwhPerKwp !== undefined ? { gesKwhPerKwp: d.gesKwhPerKwp } : {}),
      ...(d.gesCapexTRYPerKwp !== undefined ? { gesCapexTRYPerKwp: d.gesCapexTRYPerKwp } : {}),
      ...(d.portalAcik !== undefined ? { portalAcik: d.portalAcik } : {}),
    },
  });
  await audit(session.sub, "KURUM_AYAR", "Organization", d.orgId, `baz=${d.baselineYear} netSifir=${d.netZeroYear}`, session.email);
  return NextResponse.json({ ok: true });
}
