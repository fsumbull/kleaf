import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { getScope } from "@/lib/auth";
import { getEmissionRows, categoryLabel } from "@/lib/data";
import { prisma } from "@/lib/prisma";
import { yearScopeTotals, monthlyScopeTotals, totalsByCategory, scopeOf } from "@/lib/carbon/engine";
import { MONTHS_TR, SCOPE_LABELS, categoryMeta } from "@/lib/constants";
import { audit } from "@/lib/audit";

export const runtime = "nodejs";

const INK = "FF0C4A33";
const LEAF = "FF16A34A";
const HEAD_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEAF7EF" } };

function styleHeader(row: ExcelJS.Row) {
  row.eachCell((c) => {
    c.font = { bold: true, color: { argb: INK }, size: 10 };
    c.fill = HEAD_FILL;
    c.border = { bottom: { style: "thin", color: { argb: "FFD7EADD" } } };
  });
}

export async function GET(req: Request) {
  const { session, org, year, birim } = await getScope();
  const bu = birim.unitId;
  const url = new URL(req.url);
  const tesisParam = url.searchParams.get("tesis")?.trim() || undefined;
  const kapsamParam = url.searchParams.get("kapsam")?.trim() || undefined;
  const kapsam = kapsamParam && ["1", "2", "3"].includes(kapsamParam) ? (Number(kapsamParam) as 1 | 2 | 3) : undefined;
  const tesis = tesisParam
    ? await prisma.facility.findFirst({ where: { id: tesisParam, orgId: org.id, ...(bu ? { unitId: bu } : {}) }, select: { id: true, name: true } })
    : null;
  if (tesisParam && !tesis)
    return NextResponse.json({ error: "Tesis bulunamadı" }, { status: 404 });
  const filtered = Boolean(tesis || kapsam);
  const filtreNotu = [tesis ? `tesis: ${tesis.name}` : null, kapsam ? `kapsam ${kapsam}` : null].filter(Boolean).join(" · ");

  const allRows = await getEmissionRows(org.id, bu);
  const rows = allRows.filter((r) =>
    (!tesis || r.facilityId === tesis.id) && (!kapsam || r.scope === kapsam));
  const yearRows = rows.filter((r) => r.year === year);
  const totals = yearScopeTotals(rows, year);
  const monthly = monthlyScopeTotals(yearRows);
  const byCat = [...totalsByCategory(yearRows).entries()].sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));

  const wb = new ExcelJS.Workbook();
  wb.creator = "kleaf";
  wb.created = new Date();

  // ── özet ────────────────────────────────────────────────
  const ozet = wb.addWorksheet("özet");
  ozet.columns = [{ width: 34 }, { width: 18 }, { width: 12 }];
  ozet.addRow([`${org.name} — ${year} sera gazı envanteri`]).font = { bold: true, size: 14, color: { argb: INK } };
  ozet.addRow(["kleaf · dijital karbon yönetim platformu"]).font = { size: 9, color: { argb: "FF5C7A6B" } };
  if (filtered) {
    ozet.addRow([`filtreli rapor — ${filtreNotu}`]).font = { size: 9, bold: true, color: { argb: "FFD97706" } };
  }
  ozet.addRow([]);
  const h1 = ozet.addRow(["gösterge", "değer", "birim"]);
  styleHeader(h1);
  ozet.addRow(["Toplam emisyon", Number(totals.total.toFixed(2)), "tCO₂e"]);
  ozet.addRow([SCOPE_LABELS[1], Number(totals.s1.toFixed(2)), "tCO₂e"]);
  ozet.addRow([SCOPE_LABELS[2], Number(totals.s2.toFixed(2)), "tCO₂e"]);
  ozet.addRow([SCOPE_LABELS[3], Number(totals.s3.toFixed(2)), "tCO₂e"]);
  ozet.addRow([]);
  const h2 = ozet.addRow(["ay", "kapsam 1", "kapsam 2", "kapsam 3", "toplam"]);
  styleHeader(h2);
  for (let m = 1; m <= 12; m++) {
    const t = monthly.get(`${year}-${String(m).padStart(2, "0")}`);
    if (!t) continue;
    ozet.addRow([MONTHS_TR[m - 1], Number(t.s1.toFixed(2)), Number(t.s2.toFixed(2)), Number(t.s3.toFixed(2)), Number(t.total.toFixed(2))]);
  }
  ozet.addRow([]);
  const h3 = ozet.addRow(["kaynak", "kapsam", "tCO₂e"]);
  styleHeader(h3);
  for (const [cat, v] of byCat) {
    const r = ozet.addRow([categoryLabel(cat), `Kapsam ${scopeOf(cat)}`, Number(v.toFixed(2))]);
    if (v < 0) r.getCell(3).font = { color: { argb: LEAF } };
  }

  // ── envanter (onaylı hesap kayıtları) ───────────────────
  const env = wb.addWorksheet("envanter");
  env.columns = [
    { header: "tesis", key: "tesis", width: 28 },
    { header: "yıl", key: "yil", width: 8 },
    { header: "ay", key: "ay", width: 10 },
    { header: "kategori", key: "kat", width: 26 },
    { header: "kapsam", key: "kapsam", width: 10 },
    { header: "miktar", key: "miktar", width: 12 },
    { header: "birim", key: "birim", width: 10 },
    { header: "tCO2e", key: "t", width: 12 },
  ];
  styleHeader(env.getRow(1));
  const records = await prisma.emissionRecord.findMany({
    where: {
      activityData: { facility: { orgId: org.id }, year, ...(tesis ? { facilityId: tesis.id } : {}) },
      ...(kapsam ? { scope: kapsam } : {}),
    },
    select: {
      scope: true,
      tCO2e: true,
      activityData: {
        select: { year: true, month: true, category: true, amount: true, facility: { select: { name: true } } },
      },
    },
    orderBy: { activityData: { month: "asc" } },
  });
  for (const r of records) {
    env.addRow({
      tesis: r.activityData.facility.name,
      yil: r.activityData.year,
      ay: MONTHS_TR[r.activityData.month - 1],
      kat: categoryLabel(r.activityData.category),
      kapsam: r.scope,
      miktar: r.activityData.amount,
      birim: categoryMeta(r.activityData.category)?.unit ?? "",
      t: Number(r.tCO2e.toFixed(3)),
    });
  }

  // ── ham veri (tüm faaliyet kayıtları, taslaklar dahil) ──
  const ham = wb.addWorksheet("ham veri");
  ham.columns = [
    { header: "tesis", key: "tesis", width: 28 },
    { header: "yıl", key: "yil", width: 8 },
    { header: "ay", key: "ay", width: 10 },
    { header: "kategori", key: "kat", width: 26 },
    { header: "miktar", key: "miktar", width: 12 },
    { header: "birim", key: "birim", width: 10 },
    { header: "durum", key: "durum", width: 10 },
    { header: "belge ref", key: "ref", width: 18 },
  ];
  styleHeader(ham.getRow(1));
  const acts = await prisma.activityData.findMany({
    where: { facility: { orgId: org.id, ...(bu ? { unitId: bu } : {}) }, year, ...(tesis ? { facilityId: tesis.id } : {}) },
    include: { facility: { select: { name: true } } },
    orderBy: [{ month: "asc" }, { category: "asc" }],
  });
  for (const a of acts) {
    ham.addRow({
      tesis: a.facility.name,
      yil: a.year,
      ay: MONTHS_TR[a.month - 1],
      kat: categoryLabel(a.category),
      miktar: a.amount,
      birim: categoryMeta(a.category)?.unit ?? "",
      durum: a.status,
      ref: a.documentRef ?? "",
    });
  }

  // ── filo (araç bazında yıllık emisyon) — yalnız filtresiz tam raporda ──
  const vehicles = filtered ? [] : await prisma.vehicle.findMany({
    where: { orgId: org.id, ...(bu ? { facility: { unitId: bu } } : {}) },
    include: {
      activityData: {
        where: { year, status: "ONAYLI" },
        select: { emissionRecord: { select: { tCO2e: true } } },
      },
    },
    orderBy: { plateNo: "asc" },
  });
  if (vehicles.length) {
    const filo = wb.addWorksheet("filo");
    filo.columns = [
      { header: "plaka", key: "plaka", width: 14 },
      { header: "araç", key: "ad", width: 26 },
      { header: "tip", key: "tip", width: 12 },
      { header: "yakıt", key: "yakit", width: 12 },
      { header: "model yılı", key: "model", width: 10 },
      { header: "durum", key: "durum", width: 10 },
      { header: `tCO2e (${year})`, key: "t", width: 14 },
    ];
    styleHeader(filo.getRow(1));
    for (const v of vehicles) {
      const t = v.activityData.reduce((s2, a) => s2 + (a.emissionRecord?.tCO2e ?? 0), 0);
      filo.addRow({
        plaka: v.plateNo, ad: v.name ?? "", tip: v.vehicleType, yakit: v.fuelType,
        model: v.modelYear ?? "", durum: v.active ? "aktif" : "pasif", t: Number(t.toFixed(3)),
      });
    }
  }

  // ── atık ve GES akışları ────────────────────────────
  const FLOW_CATS = ["ATIK", "GERI_DONUSUM", "KOMPOST", "GES_URETIM", "GES_SATIS"] as const;
  const flows = filtered ? [] : await prisma.activityData.groupBy({
    by: ["category"],
    where: { facility: { orgId: org.id, ...(bu ? { unitId: bu } : {}) }, year, status: "ONAYLI", category: { in: [...FLOW_CATS] } },
    _sum: { amount: true },
  });
  if (flows.length) {
    const akis = wb.addWorksheet("atık ve GES");
    akis.columns = [{ width: 30 }, { width: 16 }, { width: 10 }];
    const hf = akis.addRow(["akış", "miktar", "birim"]);
    styleHeader(hf);
    for (const f of flows) {
      akis.addRow([categoryLabel(f.category), Number((f._sum.amount ?? 0).toFixed(1)), categoryMeta(f.category)?.unit ?? ""]);
    }
  }

  // ── eylem planı ──────────────────────────────────
  const plans = filtered ? [] : await prisma.actionPlan.findMany({
    where: { orgId: org.id },
    include: { unit: { select: { name: true } }, progress: { select: { achievedTCO2e: true, spentTRY: true } } },
    orderBy: { title: "asc" },
  });
  if (plans.length) {
    const ep = wb.addWorksheet("eylem planı");
    ep.columns = [
      { header: "eylem", key: "ad", width: 40 },
      { header: "sorumlu", key: "sorumlu", width: 26 },
      { header: "durum", key: "durum", width: 16 },
      { header: "bütçe (TL)", key: "butce", width: 14 },
      { header: "harcanan (TL)", key: "harcanan", width: 14 },
      { header: "hedef azaltım (tCO2e)", key: "hedef", width: 20 },
      { header: "gerçekleşen (tCO2e)", key: "gercek", width: 18 },
      { header: "başlangıç", key: "bas", width: 12 },
      { header: "bitiş", key: "bit", width: 12 },
    ];
    styleHeader(ep.getRow(1));
    for (const p of plans) {
      ep.addRow({
        ad: p.title,
        sorumlu: p.unit?.name ?? p.owner ?? "",
        durum: p.status,
        butce: p.budgetTRY ?? "",
        harcanan: p.progress.reduce((s2, x) => s2 + (x.spentTRY ?? 0), 0),
        hedef: p.targetReductionTCO2e ?? "",
        gercek: p.progress.reduce((s2, x) => s2 + (x.achievedTCO2e ?? 0), 0),
        bas: p.startDate ? p.startDate.toISOString().slice(0, 10) : "",
        bit: p.endDate ? p.endDate.toISOString().slice(0, 10) : "",
      });
    }
  }

  const buf = await wb.xlsx.writeBuffer();
  await audit(session.sub, "RAPOR_EXCEL", "Report", null, `${org.name} ${year}${filtered ? ` (${filtreNotu})` : ""}`, session.email);

  return new NextResponse(new Uint8Array(buf as ArrayBuffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="kleaf-envanter-${year}${filtered ? "-filtreli" : ""}.xlsx"`,
    },
  });
}
