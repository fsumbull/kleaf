import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { prisma } from "@/lib/prisma";
import { apiSession } from "@/lib/auth";
import { CATEGORIES } from "@/lib/constants";

export const runtime = "nodejs";

/** Kuruma özel doldurulabilir Excel şablonu üretir. */
export async function GET() {
  const session = await apiSession(["SUPER_ADMIN", "IKLIM_MERKEZI", "MUDURLUK_VERI", "ENERJI_YONETICISI", "FILO_YONETICISI", "ATIK_UZMANI"]);
  if (!session) return NextResponse.json({ error: "Yetkiniz yok" }, { status: 403 });

  const facilities = session.orgId
    ? await prisma.facility.findMany({ where: { orgId: session.orgId }, select: { name: true }, orderBy: { name: "asc" } })
    : await prisma.facility.findMany({ select: { name: true }, orderBy: { name: "asc" }, take: 50 });
  const vehicles = session.orgId
    ? await prisma.vehicle.findMany({ where: { orgId: session.orgId, active: true }, select: { plateNo: true, name: true }, orderBy: { plateNo: "asc" } })
    : [];

  const wb = new ExcelJS.Workbook();
  wb.creator = "kleaf";

  const ws = wb.addWorksheet("veri");
  ws.columns = [
    { header: "tesis", key: "tesis", width: 32 },
    { header: "yil", key: "yil", width: 8 },
    { header: "ay", key: "ay", width: 6 },
    { header: "kategori", key: "kategori", width: 16 },
    { header: "miktar", key: "miktar", width: 14 },
    { header: "belge_ref", key: "belge", width: 24 },
    { header: "arac_plaka", key: "plaka", width: 16 },
  ];
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDCFCE8" } };
  // örnek satırlar — tesis geneli + araç bazlı
  ws.addRow({ tesis: facilities[0]?.name ?? "Örnek Tesis", yil: 2026, ay: 6, kategori: "ELEKTRIK", miktar: 12500, belge: "fatura-2026-06", plaka: "" });
  if (vehicles[0]) ws.addRow({ tesis: facilities[0]?.name ?? "Örnek Tesis", yil: 2026, ay: 6, kategori: "DIZEL", miktar: 480, belge: "akaryakıt-2026-06", plaka: vehicles[0].plateNo });

  const ref = wb.addWorksheet("kategoriler");
  ref.columns = [
    { header: "kod", key: "kod", width: 16 },
    { header: "ad", key: "ad", width: 26 },
    { header: "birim", key: "birim", width: 12 },
    { header: "kapsam", key: "kapsam", width: 10 },
  ];
  ref.getRow(1).font = { bold: true };
  for (const c of CATEGORIES) ref.addRow({ kod: c.code, ad: c.label, birim: c.unit, kapsam: c.scope });

  const tes = wb.addWorksheet("tesisler");
  tes.columns = [{ header: "tesis adı (birebir kopyalayın)", key: "n", width: 40 }];
  tes.getRow(1).font = { bold: true };
  for (const f of facilities) tes.addRow({ n: f.name });

  if (vehicles.length > 0) {
    const arac = wb.addWorksheet("araclar");
    arac.columns = [
      { header: "plaka (arac_plaka kolonuna birebir kopyalayın)", key: "p", width: 42 },
      { header: "ad", key: "a", width: 26 },
    ];
    arac.getRow(1).font = { bold: true };
    for (const v of vehicles) arac.addRow({ p: v.plateNo, a: v.name ?? "" });
  }

  const buf = await wb.xlsx.writeBuffer();
  return new NextResponse(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="kleaf-veri-sablonu.xlsx"',
    },
  });
}
