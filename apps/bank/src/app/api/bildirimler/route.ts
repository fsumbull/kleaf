/* Bildirim merkezi (banka) — canlı hesaplanan uyarılar: bekleyen kredi talepleri,
 * açık uyum bayrakları ve açık ticaret emirleri. */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiSession } from "@/lib/auth";

export interface BildirimItem {
  id: string;
  mesaj: string;
  href: string;
  onem: "bilgi" | "uyari" | "kritik";
}

export async function GET() {
  const s = await apiSession();
  if (!s || !s.orgId) return NextResponse.json({ error: "Yetkiniz yok" }, { status: 403 });
  const orgId = s.orgId;
  const items: BildirimItem[] = [];

  const org = await prisma.organization.findUnique({ where: { id: orgId }, select: { type: true } });
  if (org?.type !== "KARBON_BANK") return NextResponse.json({ items });

  const [talep, aski, acikBayrak, acikEmir] = await Promise.all([
    prisma.creditTransaction.count({ where: { bankOrgId: orgId, status: "TALEP" } }),
    prisma.creditTransaction.count({ where: { bankOrgId: orgId, status: "DENETIM_ASKI" } }),
    prisma.complianceFlag.count({ where: { durum: "ACIK", transaction: { bankOrgId: orgId } } }),
    prisma.tradeOrder.count({ where: { bankOrgId: orgId, status: "ACIK" } }),
  ]);

  if (talep > 0) items.push({
    id: `talep-${talep}`,
    mesaj: `${talep} kredi talebi karar bekliyor`,
    href: "/banka", onem: "uyari",
  });
  if (aski > 0) items.push({
    id: `aski-${aski}`,
    mesaj: `${aski} işlem denetim askısında`,
    href: "/banka", onem: "kritik",
  });
  if (acikBayrak > 0) items.push({
    id: `bayrak-${acikBayrak}`,
    mesaj: `${acikBayrak} açık uyum bayrağı çözüm bekliyor`,
    href: "/banka", onem: "kritik",
  });
  if (acikEmir > 0) items.push({
    id: `emir-${acikEmir}`,
    mesaj: `${acikEmir} ticaret emri açık durumda`,
    href: "/ticaret", onem: "bilgi",
  });

  return NextResponse.json({ items });
}
