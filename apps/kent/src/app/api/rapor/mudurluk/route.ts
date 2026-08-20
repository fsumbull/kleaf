/* Müdürlük karnesi — birim bazında emisyon, veri tamlığı ve onay durumu (XLSX) */
import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { getScope } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";

export const runtime = "nodejs";

const INK = "FF0C4A33";
const HEAD_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEAF7EF" } };

export async function GET() {
  const { session, org, year } = await getScope();

  const units = await prisma.unit.findMany({
    where: { orgId: org.id },
    orderBy: { name: "asc" },
    include: {
      facilities: {
        select: {
          name: true,
          activityData: {
            where: { year },
            select: { status: true, documentRef: true, emissionRecord: { select: { tCO2e: true } }, documents: { select: { id: true } } },
          },
        },
      },
      actionPlans: {
        select: { title: true, targetReductionTCO2e: true, progress: { select: { achievedTCO2e: true } } },
      },
    },
  });

  const wb = new ExcelJS.Workbook();
  wb.creator = "KarbonKent Kurumsal";
  wb.created = new Date();
  const ws = wb.addWorksheet("müdürlük karnesi");
  ws.columns = [{ width: 34 }, { width: 10 }, { width: 12 }, { width: 14 }, { width: 12 }, { width: 14 }, { width: 16 }, { width: 18 }];

  ws.addRow([`${org.name} — ${year} müdürlük karnesi`]).font = { bold: true, size: 14, color: { argb: INK } };
  ws.addRow(["KarbonKent Kurumsal · birim bazlı emisyon ve veri disiplini karnesi"]).font = { size: 9, color: { argb: "FF5C7A6B" } };
  ws.addRow([]);
  const head = ws.addRow(["müdürlük", "kayıt", "onaylı %", "belge %", "taslak", "emisyon (tCO₂e)", "eylem azaltımı (t)", "karne notu"]);
  head.eachCell((c) => { c.font = { bold: true, color: { argb: INK }, size: 10 }; c.fill = HEAD_FILL; });

  for (const u of units) {
    const acts = u.facilities.flatMap((f) => f.activityData);
    const toplam = acts.length;
    const onayli = acts.filter((a) => a.status === "ONAYLI").length;
    const belgeli = acts.filter((a) => a.documentRef || a.documents.length > 0).length;
    const taslak = acts.filter((a) => a.status === "TASLAK").length;
    const emisyon = acts.reduce((s, a) => s + (a.emissionRecord?.tCO2e ?? 0), 0);
    const azaltim = u.actionPlans.reduce((s, p) => s + p.progress.reduce((x, q) => x + q.achievedTCO2e, 0), 0);
    const onayOran = toplam ? onayli / toplam : 0;
    const belgeOran = toplam ? belgeli / toplam : 0;
    const skor = toplam === 0 ? null : Math.round(100 * (0.6 * onayOran + 0.4 * belgeOran));
    const not = skor === null ? "veri yok" : skor >= 90 ? "A" : skor >= 75 ? "B" : skor >= 60 ? "C" : "D";
    ws.addRow([
      u.name, toplam,
      toplam ? Number((onayOran * 100).toFixed(1)) : "—",
      toplam ? Number((belgeOran * 100).toFixed(1)) : "—",
      taslak, Number(emisyon.toFixed(2)), Number(azaltim.toFixed(1)),
      skor === null ? "veri yok" : `${not} (${skor}/100)`,
    ]);
  }

  ws.addRow([]);
  ws.addRow(["Not: karne notu = 0,6×onay oranı + 0,4×belge oranı. Emisyon, onaylı kayıtların faktör anlık görüntüleriyle hesaplanır."]).font = { size: 9, color: { argb: "FF5C7A6B" } };

  const buf = await wb.xlsx.writeBuffer();
  await audit(session.sub, "RAPOR_MUDURLUK", "Organization", org.id, `${year} müdürlük karnesi`, session.email);
  return new NextResponse(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="karbonkent-mudurluk-karnesi-${year}.xlsx"`,
    },
  });
}
