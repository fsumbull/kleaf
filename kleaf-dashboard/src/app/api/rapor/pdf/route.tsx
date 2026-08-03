import { NextResponse } from "next/server";
import path from "node:path";
import React from "react";
import { Document, Page, Text, View, Font, StyleSheet, renderToBuffer, Svg, Path } from "@react-pdf/renderer";
import { getScope } from "@/lib/auth";
import { getEmissionRows, categoryLabel, resolveFactor } from "@/lib/data";
import { prisma } from "@/lib/prisma";
import {
  yearScopeTotals, monthlyScopeTotals, totalsByCategory, totalsByFacility, yoyChangePct, scopeOf,
} from "@/lib/carbon/engine";
import { MONTHS_TR, SCOPE_LABELS, CITY_SECTOR_LABELS, type CitySector } from "@/lib/constants";
import { audit } from "@/lib/audit";

export const runtime = "nodejs";

const fontDir = path.join(process.cwd(), "src", "assets", "fonts");
Font.register({
  family: "SpaceGrotesk",
  fonts: [
    { src: path.join(fontDir, "SpaceGrotesk-Regular.ttf"), fontWeight: 400 },
    { src: path.join(fontDir, "SpaceGrotesk-Medium.ttf"), fontWeight: 500 },
    { src: path.join(fontDir, "SpaceGrotesk-Bold.ttf"), fontWeight: 700 },
  ],
});
// Türkçe metinde tireleme kapatılır
Font.registerHyphenationCallback((w) => [w]);

const INK = "#0c4a33";
const LEAF = "#16a34a";
const MUTED = "#5c7a6b";
const LINE = "#d7eadd";

const s = StyleSheet.create({
  page: { fontFamily: "SpaceGrotesk", fontSize: 9.5, color: INK, paddingTop: 52, paddingBottom: 56, paddingHorizontal: 46 },
  h1: { fontSize: 22, fontWeight: 700, letterSpacing: -0.4 },
  h2: { fontSize: 13, fontWeight: 700, marginBottom: 8, letterSpacing: -0.2 },
  eyebrow: { fontSize: 8, color: LEAF, letterSpacing: 2, textTransform: "lowercase", marginBottom: 4 },
  muted: { color: MUTED },
  row: { flexDirection: "row" },
  kpiBox: { flex: 1, border: `1pt solid ${LINE}`, borderRadius: 8, padding: 10, marginRight: 8 },
  kpiVal: { fontSize: 16, fontWeight: 700, color: LEAF, marginTop: 2 },
  th: { fontSize: 8, color: MUTED, fontWeight: 500, textTransform: "lowercase", letterSpacing: 0.8 },
  td: { fontSize: 9.5 },
  tr: { flexDirection: "row", borderBottom: `0.5pt solid ${LINE}`, paddingVertical: 4.5, alignItems: "center" },
  section: { marginTop: 18 },
  footer: {
    position: "absolute", bottom: 26, left: 46, right: 46,
    flexDirection: "row", justifyContent: "space-between",
    fontSize: 7.5, color: MUTED, borderTop: `0.5pt solid ${LINE}`, paddingTop: 6,
  },
});

const nf = (v: number, d = 1) =>
  v.toLocaleString("tr-TR", { minimumFractionDigits: d, maximumFractionDigits: d });
const tons = (v: number) => (Math.abs(v) >= 100 ? nf(v, 0) : nf(v, 1));

function LogoPdf({ size = 26 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 120 120">
      <Path d="M60 8 L103 33 V85 L60 110 L17 85 V33 Z" stroke={INK} strokeWidth={7} fill="none" />
      <Path d="M40 82 C40 52 55 38 84 38 C84 68 69 82 40 82 Z" fill={LEAF} />
    </Svg>
  );
}

function Footer({ org, year }: { org: string; year: number }) {
  return (
    <View style={s.footer} fixed>
      <Text>kleaf · dijital karbon yönetim platformu — {org} · {year} sera gazı envanteri</Text>
      <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
    </View>
  );
}

export async function GET(req: Request) {
  const { session, org, year } = await getScope();
  const url = new URL(req.url);
  const tur = url.searchParams.get("tur");
  const tesisParam = url.searchParams.get("tesis")?.trim() || undefined;
  const kapsamParam = url.searchParams.get("kapsam")?.trim() || undefined;
  const kapsam = kapsamParam && ["1", "2", "3"].includes(kapsamParam) ? (Number(kapsamParam) as 1 | 2 | 3) : undefined;

  /* ── kent ölçeği raporu (yalnız belediyeler) ── */
  if (tur === "kent") {
    if (org.type !== "BELEDIYE")
      return NextResponse.json({ error: "Kent raporu yalnız belediyeler içindir" }, { status: 400 });
    return kentPdf(session.sub, session.email, org, year);
  }

  const tesis = tesisParam
    ? await prisma.facility.findFirst({ where: { id: tesisParam, orgId: org.id }, select: { id: true, name: true } })
    : null;
  if (tesisParam && !tesis)
    return NextResponse.json({ error: "Tesis bulunamadı" }, { status: 404 });

  const filtered = Boolean(tesis || kapsam);
  const allRows = await getEmissionRows(org.id);
  const rows = allRows.filter((r) =>
    (!tesis || r.facilityId === tesis.id) && (!kapsam || r.scope === kapsam));
  const filtreNotu = [tesis ? `tesis: ${tesis.name}` : null, kapsam ? `kapsam ${kapsam}` : null]
    .filter(Boolean).join(" · ");
  const yearRows = rows.filter((r) => r.year === year);
  const totals = yearScopeTotals(rows, year);
  const yoy = yoyChangePct(rows, year);
  const monthly = monthlyScopeTotals(yearRows);
  const byCat = [...totalsByCategory(yearRows).entries()].sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
  const byFacRaw = totalsByFacility(yearRows);
  const facilities = await prisma.facility.findMany({ where: { orgId: org.id }, select: { id: true, name: true } });
  const byFac = [...byFacRaw.entries()]
    .map(([fid, t]) => ({ name: facilities.find((f) => f.id === fid)?.name ?? "—", t }))
    .sort((a, b) => b.t - a.t);
  const target = await prisma.target.findUnique({ where: { orgId_year: { orgId: org.id, year } } });

  /* modül özetleri — filo, atık/GES akışları, eylem planı */
  const [vehicles, flows, plans] = await Promise.all([
    prisma.vehicle.findMany({
      where: { orgId: org.id, active: true },
      include: { activityData: { where: { year, status: "ONAYLI" }, select: { emissionRecord: { select: { tCO2e: true } } } } },
    }),
    prisma.activityData.groupBy({
      by: ["category"],
      where: { facility: { orgId: org.id }, year, status: "ONAYLI", category: { in: ["ATIK", "GERI_DONUSUM", "KOMPOST", "GES_URETIM", "GES_SATIS"] } },
      _sum: { amount: true },
    }),
    prisma.actionPlan.findMany({
      where: { orgId: org.id },
      include: { unit: { select: { name: true } }, progress: { select: { achievedTCO2e: true } } },
      orderBy: { title: "asc" },
    }),
  ]);
  const fleetRows = vehicles
    .map((v) => ({ plate: v.plateNo, fuel: v.fuelType, t: v.activityData.reduce((s2, a) => s2 + (a.emissionRecord?.tCO2e ?? 0), 0) }))
    .filter((v) => v.t > 0)
    .sort((a, b) => b.t - a.t)
    .slice(0, 6);
  const flowOf = (c: string) => flows.find((f) => f.category === c)?._sum.amount ?? 0;
  const now = new Date();

  const doc = (
    <Document title={`${org.name} — ${year} Sera Gazı Envanteri`} author="kleaf" creator="kleaf">
      {/* kapak + özet */}
      <Page size="A4" style={s.page}>
        <View style={[s.row, { alignItems: "center", marginBottom: 26 }]}>
          <LogoPdf />
          <View style={{ marginLeft: 10 }}>
            <Text style={{ fontSize: 15, fontWeight: 700 }}>kleaf</Text>
            <Text style={{ fontSize: 7.5, color: MUTED, letterSpacing: 1.4 }}>dijital karbon yönetim platformu</Text>
          </View>
        </View>

        <Text style={s.eyebrow}>kurumsal sera gazı envanter raporu</Text>
        <Text style={s.h1}>{org.name}</Text>
        <Text style={[s.muted, { fontSize: 10, marginTop: 4 }]}>
          {year} raporlama yılı · ISO 14064-1 ve GHG Protokolü ilkeleriyle uyumlu · baz yıl {org.baselineYear} · hedef {org.netZeroYear} net-sıfır
        </Text>
        {filtered && (
          <Text style={{ fontSize: 9, color: "#d97706", marginTop: 6, fontWeight: 500 }}>
            Filtreli rapor — {filtreNotu}. Tablolar yalnız bu filtre kapsamındaki kayıtları içerir.
          </Text>
        )}

        <View style={[s.row, s.section]}>
          <View style={s.kpiBox}>
            <Text style={s.th}>toplam emisyon</Text>
            <Text style={s.kpiVal}>{tons(totals.total)} tCO₂e</Text>
          </View>
          <View style={s.kpiBox}>
            <Text style={s.th}>yıllık değişim</Text>
            <Text style={[s.kpiVal, { color: yoy !== null && yoy > 0 ? "#d97706" : LEAF }]}>
              {yoy === null ? "—" : `${yoy > 0 ? "+" : ""}${nf(yoy)}%`}
            </Text>
          </View>
          <View style={s.kpiBox}>
            <Text style={s.th}>{year} hedefi</Text>
            <Text style={s.kpiVal}>{target ? `${tons(target.targetTCO2e)} tCO₂e` : "tanımsız"}</Text>
          </View>
          <View style={[s.kpiBox, { marginRight: 0 }]}>
            <Text style={s.th}>hedef durumu</Text>
            <Text style={[s.kpiVal, { color: target && totals.total > target.targetTCO2e ? "#dc2626" : LEAF }]}>
              {target ? (totals.total <= target.targetTCO2e ? "hedefin altında" : "hedefin üzerinde") : "—"}
            </Text>
          </View>
        </View>

        <View style={s.section}>
          <Text style={s.h2}>Kapsam bazında dağılım</Text>
          {[1, 2, 3].map((sc) => {
            const v = sc === 1 ? totals.s1 : sc === 2 ? totals.s2 : totals.s3;
            const pct = totals.total > 0 ? (v / totals.total) * 100 : 0;
            return (
              <View key={sc} style={s.tr}>
                <Text style={[s.td, { width: 190 }]}>{SCOPE_LABELS[sc as 1 | 2 | 3]}</Text>
                <View style={{ flex: 1, height: 7, backgroundColor: "#eaf7ef", borderRadius: 4, marginRight: 10 }}>
                  <View style={{ width: `${pct}%`, height: 7, backgroundColor: LEAF, borderRadius: 4 }} />
                </View>
                <Text style={[s.td, { width: 80, textAlign: "right" }]}>{tons(v)} tCO₂e</Text>
                <Text style={[s.td, s.muted, { width: 46, textAlign: "right" }]}>%{nf(pct, 0)}</Text>
              </View>
            );
          })}
          <Text style={[s.muted, { fontSize: 7.5, marginTop: 6 }]}>
            Not: GES öz tüketimi Kapsam 2 mahsubu olarak negatif kaydedilir; aylık Kapsam 2 toplamı 0&apos;ın altına inmez.
          </Text>
        </View>

        <View style={s.section}>
          <Text style={s.h2}>Aylık seyir</Text>
          <View style={s.tr}>
            <Text style={[s.th, { width: 70 }]}>ay</Text>
            <Text style={[s.th, { width: 90, textAlign: "right" }]}>kapsam 1</Text>
            <Text style={[s.th, { width: 90, textAlign: "right" }]}>kapsam 2</Text>
            <Text style={[s.th, { width: 90, textAlign: "right" }]}>kapsam 3</Text>
            <Text style={[s.th, { flex: 1, textAlign: "right" }]}>toplam</Text>
          </View>
          {Array.from({ length: 12 }, (_, i) => {
            const t = monthly.get(`${year}-${String(i + 1).padStart(2, "0")}`);
            if (!t) return null;
            return (
              <View key={i} style={s.tr}>
                <Text style={[s.td, { width: 70 }]}>{MONTHS_TR[i]}</Text>
                <Text style={[s.td, { width: 90, textAlign: "right" }]}>{tons(t.s1)}</Text>
                <Text style={[s.td, { width: 90, textAlign: "right" }]}>{tons(t.s2)}</Text>
                <Text style={[s.td, { width: 90, textAlign: "right" }]}>{tons(t.s3)}</Text>
                <Text style={[s.td, { flex: 1, textAlign: "right", fontWeight: 700 }]}>{tons(t.total)}</Text>
              </View>
            );
          })}
        </View>

        <Footer org={org.name} year={year} />
      </Page>

      {/* detay sayfası */}
      <Page size="A4" style={s.page}>
        <View style={s.section}>
          <Text style={s.h2}>Emisyon kaynakları (kategori bazında)</Text>
          <View style={s.tr}>
            <Text style={[s.th, { flex: 1 }]}>kaynak</Text>
            <Text style={[s.th, { width: 70, textAlign: "right" }]}>kapsam</Text>
            <Text style={[s.th, { width: 100, textAlign: "right" }]}>tCO₂e</Text>
          </View>
          {byCat.map(([cat, v]) => (
            <View key={cat} style={s.tr}>
              <Text style={[s.td, { flex: 1 }]}>{categoryLabel(cat)}</Text>
              <Text style={[s.td, s.muted, { width: 70, textAlign: "right" }]}>{scopeOf(cat)}</Text>
              <Text style={[s.td, { width: 100, textAlign: "right", color: v < 0 ? LEAF : INK }]}>{tons(v)}</Text>
            </View>
          ))}
        </View>

        <View style={s.section}>
          <Text style={s.h2}>Tesis bazında toplamlar</Text>
          <View style={s.tr}>
            <Text style={[s.th, { flex: 1 }]}>tesis</Text>
            <Text style={[s.th, { width: 100, textAlign: "right" }]}>tCO₂e</Text>
          </View>
          {byFac.map((f) => (
            <View key={f.name} style={s.tr}>
              <Text style={[s.td, { flex: 1 }]}>{f.name}</Text>
              <Text style={[s.td, { width: 100, textAlign: "right" }]}>{tons(f.t)}</Text>
            </View>
          ))}
        </View>

        <View style={s.section}>
          <Text style={s.h2}>Yöntem ve kapsam notu</Text>
          <Text style={[s.td, { lineHeight: 1.55, color: MUTED }]}>
            Bu rapor, faaliyet verilerinin onay anında geçerli emisyon faktörleriyle çarpılmasıyla hesaplanan ve
            değiştirilemez hesap izi (faktör anlık görüntüsü) ile saklanan kayıtlardan üretilmiştir. Kapsam 1 doğrudan
            emisyonları (sabit yakma ve kurum araçları), Kapsam 2 satın alınan elektriği (lokasyon bazlı), Kapsam 3 ise
            atık, su ve iş seyahatlerini içerir. Yalnızca onaylı kayıtlar envantere dahildir; taslak kayıtlar rapor
            dışıdır. Hesap motoru sürümü kayıt bazında saklanır.
          </Text>
        </View>

        <Footer org={org.name} year={year} />
      </Page>

      {/* modül özetleri — yalnız filtresiz tam raporda */}
      {!filtered && (
      <Page size="A4" style={s.page}>
        <Text style={s.eyebrow}>modül özetleri</Text>
        <Text style={s.h2}>Araç filosu — en yüksek emisyonlu araçlar</Text>
        {fleetRows.length === 0 ? (
          <Text style={[s.td, s.muted]}>Bu yıl için araç bazında kayıt bulunmuyor.</Text>
        ) : (
          <>
            <View style={s.tr}>
              <Text style={[s.th, { width: 90 }]}>plaka</Text>
              <Text style={[s.th, { width: 80 }]}>yakıt</Text>
              <Text style={[s.th, { flex: 1, textAlign: "right" }]}>tCO₂e</Text>
            </View>
            {fleetRows.map((v) => (
              <View key={v.plate} style={s.tr}>
                <Text style={[s.td, { width: 90 }]}>{v.plate}</Text>
                <Text style={[s.td, s.muted, { width: 80 }]}>{v.fuel.toLowerCase()}</Text>
                <Text style={[s.td, { flex: 1, textAlign: "right" }]}>{tons(v.t)}</Text>
              </View>
            ))}
          </>
        )}

        <View style={s.section}>
          <Text style={s.h2}>Atık ve güneş enerjisi akışları</Text>
          <View style={s.tr}>
            <Text style={[s.th, { flex: 1 }]}>akış</Text>
            <Text style={[s.th, { width: 130, textAlign: "right" }]}>yıllık miktar</Text>
          </View>
          {([
            ["Atık (düzenli depolama)", flowOf("ATIK"), "ton"],
            ["Geri dönüşüme saptırılan", flowOf("GERI_DONUSUM"), "ton"],
            ["Komposta saptırılan", flowOf("KOMPOST"), "ton"],
            ["GES üretimi (öz tüketim)", flowOf("GES_URETIM"), "kWh"],
            ["GES şebekeye satış", flowOf("GES_SATIS"), "kWh"],
          ] as const).map(([label, v, unit]) => (
            <View key={label} style={s.tr}>
              <Text style={[s.td, { flex: 1 }]}>{label}</Text>
              <Text style={[s.td, { width: 130, textAlign: "right" }]}>{nf(v, 0)} {unit}</Text>
            </View>
          ))}
        </View>

        <View style={s.section}>
          <Text style={s.h2}>Eylem planı durumu</Text>
          {plans.length === 0 ? (
            <Text style={[s.td, s.muted]}>Tanımlı eylem bulunmuyor.</Text>
          ) : (
            <>
              <View style={s.tr}>
                <Text style={[s.th, { flex: 1 }]}>eylem</Text>
                <Text style={[s.th, { width: 120 }]}>sorumlu</Text>
                <Text style={[s.th, { width: 76 }]}>durum</Text>
                <Text style={[s.th, { width: 90, textAlign: "right" }]}>hedef / gerçekleşen</Text>
              </View>
              {plans.map((p) => {
                const done = p.progress.reduce((s2, x) => s2 + (x.achievedTCO2e ?? 0), 0);
                const late = p.endDate && p.endDate < now && p.status !== "TAMAMLANDI";
                return (
                  <View key={p.id} style={s.tr}>
                    <Text style={[s.td, { flex: 1, paddingRight: 6 }]}>{p.title}</Text>
                    <Text style={[s.td, s.muted, { width: 120 }]}>{p.unit?.name ?? p.owner ?? "—"}</Text>
                    <Text style={[s.td, { width: 76, color: late ? "#dc2626" : INK }]}>
                      {late ? "gecikmiş" : p.status.toLowerCase().replaceAll("_", " ")}
                    </Text>
                    <Text style={[s.td, { width: 90, textAlign: "right" }]}>
                      {p.targetReductionTCO2e ? nf(p.targetReductionTCO2e, 0) : "—"} / {nf(done, 0)}
                    </Text>
                  </View>
                );
              })}
            </>
          )}
        </View>

        <Footer org={org.name} year={year} />
      </Page>
      )}
    </Document>
  );

  const buf = await renderToBuffer(doc);
  await audit(session.sub, "RAPOR_PDF", "Report", null, `${org.name} ${year}${filtered ? ` (${filtreNotu})` : ""}`, session.email);

  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="kleaf-envanter-${year}${filtered ? "-filtreli" : ""}.pdf"`,
    },
  });
}

/* ── kent ölçeği PDF raporu (GPC BASIC sadeleştirmesi) ── */
async function kentPdf(
  userId: string,
  email: string | undefined,
  org: { id: string; name: string },
  year: number
) {
  const [rows, neighborhoods] = await Promise.all([
    prisma.cityActivity.findMany({ where: { orgId: org.id }, orderBy: [{ year: "asc" }, { sector: "asc" }] }),
    prisma.neighborhood.findMany({ where: { orgId: org.id }, orderBy: { population: "desc" } }),
  ]);

  const years = [...new Set(rows.map((r) => r.year))].sort();
  const refYear = years.includes(year) ? year : [...years].reverse().find((y) => y < year) ?? years.at(-1) ?? year;

  const cats = [...new Set(rows.map((r) => r.category))];
  const factorEntries = await Promise.all(cats.map(async (c) => [c, (await resolveFactor(org.id, c))?.kgCO2ePerUnit ?? 0] as const));
  const factor = new Map(factorEntries);
  const tOf = (r: { category: string; amount: number }) => (r.amount * (factor.get(r.category) ?? 0)) / 1000;

  const bySector = new Map<string, number>();
  const byCat = new Map<string, { sector: string; category: string; amount: number; tCO2e: number }>();
  for (const r of rows.filter((x) => x.year === refYear)) {
    const t = tOf(r);
    bySector.set(r.sector, (bySector.get(r.sector) ?? 0) + t);
    const key = `${r.sector}|${r.category}`;
    const e = byCat.get(key) ?? { sector: r.sector, category: r.category, amount: 0, tCO2e: 0 };
    e.amount += r.amount; e.tCO2e += t;
    byCat.set(key, e);
  }
  const sectors = [...bySector.entries()]
    .map(([sector, t]) => ({ label: CITY_SECTOR_LABELS[sector as CitySector] ?? sector, t }))
    .filter((x) => x.t > 0)
    .sort((a, b) => b.t - a.t);
  const total = sectors.reduce((s2, x) => s2 + x.t, 0);
  const population = neighborhoods.reduce((s2, n) => s2 + n.population, 0);
  const perCapita = population > 0 ? total / population : null;
  const catRows = [...byCat.values()].sort((a, b) => b.tCO2e - a.tCO2e).slice(0, 14);

  const doc = (
    <Document title={`${org.name} — ${refYear} Kent Envanteri`} author="kleaf" creator="kleaf">
      <Page size="A4" style={s.page}>
        <View style={[s.row, { alignItems: "center", marginBottom: 26 }]}>
          <LogoPdf />
          <View style={{ marginLeft: 10 }}>
            <Text style={{ fontSize: 15, fontWeight: 700 }}>kleaf</Text>
            <Text style={{ fontSize: 7.5, color: MUTED, letterSpacing: 1.4 }}>dijital karbon yönetim platformu</Text>
          </View>
        </View>

        <Text style={s.eyebrow}>kent ölçeği sera gazı envanteri · gpc basic sadeleştirmesi</Text>
        <Text style={s.h1}>{org.name}</Text>
        <Text style={[s.muted, { fontSize: 10, marginTop: 4 }]}>
          {refYear} envanter yılı · kent sınırları içi topluluk emisyonları · kurumsal envanterden bağımsız
        </Text>

        <View style={[s.row, s.section]}>
          <View style={s.kpiBox}>
            <Text style={s.th}>kent toplam emisyonu</Text>
            <Text style={s.kpiVal}>{tons(total)} tCO₂e</Text>
          </View>
          <View style={s.kpiBox}>
            <Text style={s.th}>kişi başı emisyon</Text>
            <Text style={s.kpiVal}>{perCapita != null ? `${nf(perCapita, 2)} t/kişi` : "—"}</Text>
          </View>
          <View style={s.kpiBox}>
            <Text style={s.th}>nüfus tabanı</Text>
            <Text style={s.kpiVal}>{nf(population, 0)}</Text>
          </View>
          <View style={[s.kpiBox, { marginRight: 0 }]}>
            <Text style={s.th}>izlenen mahalle</Text>
            <Text style={s.kpiVal}>{neighborhoods.length}</Text>
          </View>
        </View>

        <View style={s.section}>
          <Text style={s.h2}>Sektör dağılımı</Text>
          {sectors.length === 0 ? (
            <Text style={[s.td, s.muted]}>Bu yıl için kent envanter verisi bulunmuyor.</Text>
          ) : sectors.map((x) => {
            const pct = total > 0 ? (x.t / total) * 100 : 0;
            return (
              <View key={x.label} style={s.tr}>
                <Text style={[s.td, { width: 190 }]}>{x.label}</Text>
                <View style={{ flex: 1, height: 7, backgroundColor: "#eaf7ef", borderRadius: 4, marginRight: 10 }}>
                  <View style={{ width: `${pct}%`, height: 7, backgroundColor: LEAF, borderRadius: 4 }} />
                </View>
                <Text style={[s.td, { width: 80, textAlign: "right" }]}>{tons(x.t)} tCO₂e</Text>
                <Text style={[s.td, s.muted, { width: 46, textAlign: "right" }]}>%{nf(pct, 0)}</Text>
              </View>
            );
          })}
        </View>

        <View style={s.section}>
          <Text style={s.h2}>Kategori kırılımı</Text>
          <View style={s.tr}>
            <Text style={[s.th, { width: 150 }]}>sektör</Text>
            <Text style={[s.th, { flex: 1 }]}>kategori</Text>
            <Text style={[s.th, { width: 90, textAlign: "right" }]}>aktivite</Text>
            <Text style={[s.th, { width: 80, textAlign: "right" }]}>tCO₂e</Text>
          </View>
          {catRows.map((r) => (
            <View key={`${r.sector}|${r.category}`} style={s.tr}>
              <Text style={[s.td, { width: 150 }]}>{CITY_SECTOR_LABELS[r.sector as CitySector] ?? r.sector}</Text>
              <Text style={[s.td, { flex: 1 }]}>{categoryLabel(r.category)}</Text>
              <Text style={[s.td, s.muted, { width: 90, textAlign: "right" }]}>{nf(r.amount, 0)}</Text>
              <Text style={[s.td, { width: 80, textAlign: "right" }]}>{tons(r.tCO2e)}</Text>
            </View>
          ))}
        </View>

        {neighborhoods.length > 0 && (
          <View style={s.section}>
            <Text style={s.h2}>Mahalle nüfus tabanı</Text>
            {neighborhoods.slice(0, 10).map((n) => (
              <View key={n.id} style={s.tr}>
                <Text style={[s.td, { flex: 1 }]}>{n.name}</Text>
                <Text style={[s.td, { width: 110, textAlign: "right" }]}>{nf(n.population, 0)} kişi</Text>
              </View>
            ))}
            {neighborhoods.length > 10 && (
              <Text style={[s.muted, { fontSize: 7.5, marginTop: 4 }]}>+{neighborhoods.length - 10} mahalle daha</Text>
            )}
          </View>
        )}

        <View style={s.section}>
          <Text style={s.h2}>Yöntem notu</Text>
          <Text style={[s.td, { lineHeight: 1.55, color: MUTED }]}>
            Kent envanteri, GPC (Global Protocol for Community-Scale GHG Inventories) BASIC kapsamının
            sadeleştirilmiş uyarlamasıdır. Sektör aktivite verileri kütüphane emisyon faktörleriyle çarpılarak
            hesaplanır; kurumsal (tesis bazlı) envanterden bağımsız tutulur. Nüfus tabanı mahalle kayıtlarından derlenir.
          </Text>
        </View>

        <Footer org={org.name} year={refYear} />
      </Page>
    </Document>
  );

  const buf = await renderToBuffer(doc);
  await audit(userId, "RAPOR_KENT", "Report", null, `${org.name} ${refYear} kent envanteri PDF`, email);

  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="kleaf-kent-envanter-${refYear}.pdf"`,
    },
  });
}
