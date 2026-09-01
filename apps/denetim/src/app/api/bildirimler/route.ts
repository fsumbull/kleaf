/* Bildirim merkezi (denetim) — canlı hesaplanan uyarılar: açık uyum bayrakları,
 * askıdaki işlemler ve izlemedeki kredi talepleri. */
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
  const items: BildirimItem[] = [];

  const org = await prisma.organization.findUnique({ where: { id: s.orgId }, select: { type: true } });
  if (org?.type !== "KLEAF") return NextResponse.json({ items });

  const [acikYuksek, acikDiger, aski, talep] = await Promise.all([
    prisma.complianceFlag.count({ where: { durum: "ACIK", onem: "YUKSEK" } }),
    prisma.complianceFlag.count({ where: { durum: "ACIK", onem: { not: "YUKSEK" } } }),
    prisma.creditTransaction.count({ where: { status: "DENETIM_ASKI" } }),
    prisma.creditTransaction.count({ where: { status: "TALEP" } }),
  ]);

  if (acikYuksek > 0) items.push({
    id: `bayrak-yuksek-${acikYuksek}`,
    mesaj: `${acikYuksek} yüksek önemli uyum bayrağı açık`,
    href: "/bayraklar", onem: "kritik",
  });
  if (aski > 0) items.push({
    id: `aski-${aski}`,
    mesaj: `${aski} işlem denetim askısında — karar bekliyor`,
    href: "/kredi-denetimi", onem: "uyari",
  });
  if (acikDiger > 0) items.push({
    id: `bayrak-diger-${acikDiger}`,
    mesaj: `${acikDiger} orta/düşük önemli açık bayrak izleniyor`,
    href: "/bayraklar", onem: "uyari",
  });
  if (talep > 0) items.push({
    id: `talep-${talep}`,
    mesaj: `${talep} yeni kredi talebi piyasada`,
    href: "/kredi-denetimi", onem: "bilgi",
  });

  return NextResponse.json({ items });
}
