import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { prisma } from "@/lib/prisma";
import { apiSession } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { CATEGORY_CODES, categoryMeta, type CategoryCode } from "@/lib/constants";

export const runtime = "nodejs";

interface ParsedRow {
  satir: number;
  facilityId: string;
  tesis: string;
  year: number;
  month: number;
  category: CategoryCode;
  amount: number;
  documentRef: string | null;
  vehicleId: string | null; // arac_plaka kolonundan eşlenen araç
  plaka: string | null;
  mevcut: boolean; // aynı anahtar var → güncellenecek
}

/** Excel içe aktarma. commit=false → önizleme; commit=true → yazma. */
export async function POST(req: Request) {
  const session = await apiSession(["SUPER_ADMIN", "IKLIM_MERKEZI", "MUDURLUK_VERI", "ENERJI_YONETICISI", "FILO_YONETICISI", "ATIK_UZMANI"]);
  if (!session) return NextResponse.json({ error: "Yetkiniz yok" }, { status: 403 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  const commit = form?.get("commit") === "1";
  if (!(file instanceof File)) return NextResponse.json({ error: "Dosya gerekli" }, { status: 400 });
  if (file.size > 10 * 1024 * 1024) return NextResponse.json({ error: "Dosya 10 MB'ı aşamaz" }, { status: 413 });

  // etkin kurum: süper admin çereziyle gezinebilir → formdan orgId almak yerine tesis eşleşmesiyle sınırla
  const orgFilter = session.role === "SUPER_ADMIN" ? {} : { orgId: session.orgId ?? "—" };
  const [facilities, orgVehicles] = await Promise.all([
    prisma.facility.findMany({ where: orgFilter, select: { id: true, name: true } }),
    prisma.vehicle.findMany({ where: orgFilter, select: { id: true, plateNo: true, active: true } }),
  ]);
  const facByName = new Map(facilities.map((f) => [f.name.trim().toLocaleLowerCase("tr-TR"), f.id]));
  const vehByPlate = new Map(orgVehicles.map((v) => [v.plateNo.trim().toLocaleUpperCase("tr-TR"), v]));

  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(await file.arrayBuffer());
  } catch {
    return NextResponse.json({ error: "Dosya okunamadı — .xlsx biçiminde olmalı" }, { status: 400 });
  }
  const ws = wb.getWorksheet("veri") ?? wb.worksheets[0];
  if (!ws) return NextResponse.json({ error: "Çalışma sayfası bulunamadı" }, { status: 400 });

  const rows: ParsedRow[] = [];
  const hatalar: { satir: number; mesaj: string }[] = [];

  const cellStr = (v: ExcelJS.CellValue): string =>
    v === null || v === undefined ? "" : typeof v === "object" && "text" in v ? String(v.text) : String(v);

  ws.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return; // başlık
    const [tesis, yil, ay, kategori, miktar, belge, plaka] = [1, 2, 3, 4, 5, 6, 7].map((i) => cellStr(row.getCell(i).value).trim());
    if (!tesis && !kategori && !miktar) return; // boş satır

    const facilityId = facByName.get(tesis.toLocaleLowerCase("tr-TR"));
    if (!facilityId) return void hatalar.push({ satir: rowNumber, mesaj: `Tesis bulunamadı: "${tesis}"` });

    const year = Number(yil), month = Number(ay), amount = Number(miktar.replace(",", "."));
    if (!Number.isInteger(year) || year < 2000 || year > 2100)
      return void hatalar.push({ satir: rowNumber, mesaj: `Geçersiz yıl: "${yil}"` });
    if (!Number.isInteger(month) || month < 1 || month > 12)
      return void hatalar.push({ satir: rowNumber, mesaj: `Geçersiz ay: "${ay}" (1-12)` });

    const cat = kategori.toUpperCase() as CategoryCode;
    if (!CATEGORY_CODES.includes(cat))
      return void hatalar.push({ satir: rowNumber, mesaj: `Bilinmeyen kategori: "${kategori}"` });
    if (!Number.isFinite(amount) || amount < 0)
      return void hatalar.push({ satir: rowNumber, mesaj: `Geçersiz miktar: "${miktar}"` });

    // araç eşleme (isteğe bağlı kolon): bilinmeyen ya da pasif plaka → hata satırı
    let vehicleId: string | null = null;
    if (plaka) {
      const veh = vehByPlate.get(plaka.toLocaleUpperCase("tr-TR"));
      if (!veh) return void hatalar.push({ satir: rowNumber, mesaj: `Plaka filoda bulunamadı: "${plaka}"` });
      if (!veh.active) return void hatalar.push({ satir: rowNumber, mesaj: `Pasif araç için kayıt girilemez: "${plaka}"` });
      vehicleId = veh.id;
    }

    rows.push({ satir: rowNumber, facilityId, tesis, year, month, category: cat, amount, documentRef: belge || null, vehicleId, plaka: plaka || null, mevcut: false });
  });

  // mevcut kayıtları işaretle
  for (const r of rows) {
    const existing = await prisma.activityData.findUnique({
      where: { facilityId_year_month_category_vehicleKey_inventoryKey: { facilityId: r.facilityId, year: r.year, month: r.month, category: r.category, vehicleKey: r.vehicleId ?? "", inventoryKey: "" } },
      select: { id: true },
    });
    r.mevcut = !!existing;
  }

  if (!commit) {
    return NextResponse.json({
      onizleme: true,
      toplam: rows.length,
      yeni: rows.filter((r) => !r.mevcut).length,
      guncellenecek: rows.filter((r) => r.mevcut).length,
      hatalar,
      ornekler: rows.slice(0, 8).map((r) => ({
        satir: r.satir, tesis: r.plaka ? `${r.tesis} · ${r.plaka}` : r.tesis, donem: `${r.year}-${String(r.month).padStart(2, "0")}`,
        kategori: r.category, miktar: r.amount, mevcut: r.mevcut,
      })),
    });
  }

  let eklenen = 0, guncellenen = 0;
  for (const r of rows) {
    const meta = categoryMeta(r.category);
    const key = { facilityId: r.facilityId, year: r.year, month: r.month, category: r.category, vehicleKey: r.vehicleId ?? "", inventoryKey: "" };
    // güncellenen kayıt taslağa döner → eski hesap izi geçersizdir, sil
    if (r.mevcut) {
      await prisma.emissionRecord.deleteMany({ where: { activityData: key } });
    }
    await prisma.activityData.upsert({
      where: { facilityId_year_month_category_vehicleKey_inventoryKey: key },
      create: {
        ...key, vehicleId: r.vehicleId, amount: r.amount, unit: meta.unit, documentRef: r.documentRef,
        status: "TASLAK", createdById: session.sub,
      },
      update: { amount: r.amount, documentRef: r.documentRef, status: "TASLAK" },
    });
    if (r.mevcut) guncellenen++; else eklenen++;
  }

  await audit(session.sub, "VERI_ICE_AKTAR", "ActivityData", null, `${eklenen} yeni, ${guncellenen} güncelleme, ${hatalar.length} hata`, session.email);
  return NextResponse.json({ ok: true, eklenen, guncellenen, hatalar });
}
