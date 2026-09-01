/* Bildirim merkezi — kalıcı tablo yerine canlı hesaplanan uyarılar.
 * Geciken görevler, onay bekleyen kayıtlar, kredi süreçleri ve açık uyum bayraklarını derler. */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiSession } from "@/lib/auth";
import { MERKEZ_ONAY_ROLLER, MUDURLUK_ONAY_ROLLER, birimKisitli } from "@/lib/yetki";
import type { Role } from "@/lib/constants";

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
  const role = s.role as Role;
  const now = new Date();
  const items: BildirimItem[] = [];

  const org = await prisma.organization.findUnique({ where: { id: orgId }, select: { type: true } });
  if (org?.type !== "BELEDIYE") return NextResponse.json({ items });

  const birimFiltre = birimKisitli(role) && s.unitId ? { unitId: s.unitId } : {};
  const yakinSinir = new Date(now.getTime() + 7 * 86400_000);

  const [gecikenGorev, yaklasanGorev] = await Promise.all([
    prisma.dataTask.count({ where: { orgId, status: "BEKLIYOR", dueDate: { lt: now }, ...birimFiltre } }),
    prisma.dataTask.count({ where: { orgId, status: "BEKLIYOR", dueDate: { gte: now, lt: yakinSinir }, ...birimFiltre } }),
  ]);
  if (gecikenGorev > 0) items.push({
    id: `gorev-geciken-${gecikenGorev}`,
    mesaj: `${gecikenGorev} veri toplama görevi gecikti`,
    href: "/gorevler", onem: "kritik",
  });
  if (yaklasanGorev > 0) items.push({
    id: `gorev-yaklasan-${yaklasanGorev}`,
    mesaj: `${yaklasanGorev} görevin son tarihi 7 gün içinde`,
    href: "/gorevler", onem: "uyari",
  });

  /* onay bekleyen kayıtlar — yalnız onay yetkisi olanlara */
  const onayci = MERKEZ_ONAY_ROLLER.includes(role) || MUDURLUK_ONAY_ROLLER.includes(role);
  if (onayci) {
    const taslakFiltre = birimKisitli(role) && s.unitId ? { facility: { orgId, unitId: s.unitId } } : { facility: { orgId } };
    const [taslak, araOnayli] = await Promise.all([
      prisma.activityData.count({ where: { status: "TASLAK", ...taslakFiltre } }),
      MERKEZ_ONAY_ROLLER.includes(role)
        ? prisma.activityData.count({ where: { status: "MUDURLUK_ONAYLI", facility: { orgId } } })
        : Promise.resolve(0),
    ]);
    if (taslak > 0) items.push({
      id: `taslak-${taslak}`,
      mesaj: `${taslak} kayıt onay bekliyor`,
      href: "/veri-girisi?durum=TASLAK", onem: "uyari",
    });
    if (araOnayli > 0) items.push({
      id: `ara-onay-${araOnayli}`,
      mesaj: `${araOnayli} kayıt müdürlük onaylı — nihai onay bekliyor`,
      href: "/veri-girisi?durum=MUDURLUK_ONAYLI", onem: "uyari",
    });
  }

  /* kredi süreçleri */
  const [bekleyenKredi, askidaKredi, acikBayrak] = await Promise.all([
    prisma.creditTransaction.count({ where: { buyerOrgId: orgId, status: { in: ["TALEP", "BANKA_ONAY"] } } }),
    prisma.creditTransaction.count({ where: { buyerOrgId: orgId, status: "DENETIM_ASKI" } }),
    prisma.complianceFlag.count({ where: { durum: "ACIK", transaction: { buyerOrgId: orgId } } }),
  ]);
  if (askidaKredi > 0) items.push({
    id: `kredi-aski-${askidaKredi}`,
    mesaj: `${askidaKredi} kredi işlemi denetim askısında`,
    href: "/karbon-kredi", onem: "kritik",
  });
  if (acikBayrak > 0) items.push({
    id: `bayrak-${acikBayrak}`,
    mesaj: `${acikBayrak} açık uyum bayrağı işlemlerinizi bekletiyor`,
    href: "/karbon-kredi", onem: "kritik",
  });
  if (bekleyenKredi > 0) items.push({
    id: `kredi-talep-${bekleyenKredi}`,
    mesaj: `${bekleyenKredi} kredi talebi süreçte`,
    href: "/karbon-kredi", onem: "bilgi",
  });

  return NextResponse.json({ items });
}
