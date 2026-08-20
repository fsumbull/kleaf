import { NextResponse } from "next/server";
import path from "node:path";
import React from "react";
import { Document, Page, Text, View, Font, StyleSheet, renderToBuffer, Svg, Path } from "@react-pdf/renderer";
import { prisma } from "@/lib/prisma";
import { apiSession } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { KLEAF_DENETCI_ROLLER } from "@/lib/yetki";
import { COMPLIANCE_FLAG_TYPE_LABELS, COMPLIANCE_SEVERITY_LABELS, AUDIT_DECISION_TYPE_LABELS } from "@/lib/constants";

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
Font.registerHyphenationCallback((w) => [w]);

const INK = "#0c4a33", LEAF = "#16a34a", MUTED = "#5c7a6b", LINE = "#d7eadd", AMBER = "#d97706", RED = "#b91c1c";

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
  chip: { fontSize: 7.5, paddingHorizontal: 5, paddingVertical: 1.5, borderRadius: 4, marginRight: 4 },
  footer: {
    position: "absolute", bottom: 26, left: 46, right: 46,
    flexDirection: "row", justifyContent: "space-between",
    fontSize: 7.5, color: MUTED, borderTop: `0.5pt solid ${LINE}`, paddingTop: 6,
  },
});

function LogoPdf({ size = 26 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 120 120">
      <Path d="M60 8 L103 33 V85 L60 110 L17 85 V33 Z" stroke={INK} strokeWidth={7} fill="none" />
      <Path d="M40 82 C40 52 55 38 84 38 C84 68 69 82 40 82 Z" fill={LEAF} />
    </Svg>
  );
}

function Footer({ orgName }: { orgName: string }) {
  return (
    <View style={s.footer} fixed>
      <Text>Kleaf Denetim — Uyum Raporu · {orgName}</Text>
      <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
    </View>
  );
}

function toneFor(onem: string) {
  return onem === "YUKSEK" ? RED : onem === "ORTA" ? AMBER : MUTED;
}
function toneForKarar(k: string) {
  return k === "ONAY" ? LEAF : k === "ASKI" ? AMBER : RED;
}

export async function GET(req: Request) {
  const s0 = await apiSession(KLEAF_DENETCI_ROLLER);
  if (!s0) return NextResponse.json({ error: "Yetkiniz yok" }, { status: 403 });

  const url = new URL(req.url);
  const orgId = url.searchParams.get("kurum");
  if (!orgId) return NextResponse.json({ error: "kurum parametresi gerekli" }, { status: 400 });

  const org = await prisma.organization.findUnique({ where: { id: orgId }, select: { id: true, name: true, type: true } });
  if (!org) return NextResponse.json({ error: "Kurum bulunamadı" }, { status: 404 });

  const [openFlags, resolvedFlags, decisions, txs] = await Promise.all([
    prisma.complianceFlag.findMany({ where: { orgId, durum: "ACIK" }, orderBy: [{ onem: "desc" }, { createdAt: "desc" }] }),
    prisma.complianceFlag.findMany({ where: { orgId, durum: "COZULDU" }, orderBy: { updatedAt: "desc" }, take: 20 }),
    prisma.auditDecision.findMany({
      where: { transaction: { buyerOrgId: orgId } },
      include: { transaction: { select: { amountTCO2e: true, pool: { select: { projectName: true } } } } },
      orderBy: { createdAt: "desc" }, take: 40,
    }),
    prisma.creditTransaction.findMany({
      where: { buyerOrgId: orgId, status: { in: ["TRANSFER", "DENETIM_ASKI"] } },
      select: { id: true, status: true, amountTCO2e: true, priceTRYPerTon: true, pool: { select: { projectName: true } } },
    }),
  ]);

  const kararSay: Record<string, number> = { ONAY: 0, ASKI: 0, ITIRAZ: 0 };
  for (const d of decisions) kararSay[d.karar] = (kararSay[d.karar] ?? 0) + 1;

  const yuksek = openFlags.filter((f) => f.onem === "YUKSEK").length;
  const orta = openFlags.filter((f) => f.onem === "ORTA").length;
  const dusuk = openFlags.filter((f) => f.onem === "DUSUK").length;
  const askidaki = txs.filter((t) => t.status === "DENETIM_ASKI").length;
  const toplamHacim = txs.reduce((a, t) => a + t.amountTCO2e, 0);
  const bugun = new Date().toLocaleDateString("tr-TR", { year: "numeric", month: "long", day: "numeric" });

  const doc = (
    <Document title={`${org.name} — Uyum Raporu`} author="Kleaf Denetim" creator="kleaf">
      {/* Sayfa 1 — Özet */}
      <Page size="A4" style={s.page}>
        <View style={{ ...s.row, alignItems: "flex-start", marginBottom: 20 }}>
          <LogoPdf size={30} />
          <View style={{ marginLeft: 10, flex: 1 }}>
            <Text style={s.eyebrow}>kleaf denetim — ulusal uyum otoritesi</Text>
            <Text style={s.h1}>Uyum Raporu</Text>
            <Text style={s.muted}>{org.name} · {org.type} · {bugun}</Text>
          </View>
        </View>

        <View style={{ ...s.row, marginBottom: 14 }}>
          <View style={s.kpiBox}>
            <Text style={s.th}>açık bayrak</Text>
            <Text style={s.kpiVal}>{openFlags.length}</Text>
            <Text style={s.muted}>{yuksek} yüksek · {orta} orta · {dusuk} düşük</Text>
          </View>
          <View style={s.kpiBox}>
            <Text style={s.th}>askıdaki işlem</Text>
            <Text style={{ ...s.kpiVal, color: askidaki > 0 ? AMBER : LEAF }}>{askidaki}</Text>
            <Text style={s.muted}>{kararSay.ASKI ?? 0} askı · {kararSay.ITIRAZ ?? 0} itiraz</Text>
          </View>
          <View style={{ ...s.kpiBox, marginRight: 0 }}>
            <Text style={s.th}>toplam işlem hacmi</Text>
            <Text style={s.kpiVal}>{toplamHacim.toLocaleString("tr-TR")}</Text>
            <Text style={s.muted}>tCO₂e · {txs.length} işlem</Text>
          </View>
        </View>

        <View style={s.section}>
          <Text style={s.h2}>karar özeti</Text>
          <View style={s.tr}>
            <Text style={{ ...s.th, flex: 1 }}>karar tipi</Text>
            <Text style={{ ...s.th, width: 60, textAlign: "right" }}>sayı</Text>
          </View>
          {(["ONAY", "ASKI", "ITIRAZ"] as const).map((k) => (
            <View key={k} style={s.tr}>
              <Text style={{ ...s.td, flex: 1, color: toneForKarar(k) }}>{AUDIT_DECISION_TYPE_LABELS[k]}</Text>
              <Text style={{ ...s.td, width: 60, textAlign: "right" }}>{kararSay[k] ?? 0}</Text>
            </View>
          ))}
        </View>

        <Footer orgName={org.name} />
      </Page>

      {/* Sayfa 2 — Bayraklar */}
      <Page size="A4" style={s.page}>
        <Text style={s.eyebrow}>bölüm 2</Text>
        <Text style={s.h1}>Uyum bayrakları</Text>
        <Text style={{ ...s.muted, marginBottom: 12 }}>{openFlags.length} açık, {resolvedFlags.length} son çözülen listelendi</Text>

        {openFlags.length === 0 && resolvedFlags.length === 0 ? (
          <Text style={s.muted}>Bu kurum için hiç bayrak kaydı yok.</Text>
        ) : (
          <>
            {openFlags.length > 0 && (
              <View style={s.section}>
                <Text style={s.h2}>açık bayraklar</Text>
                {openFlags.map((f) => (
                  <View key={f.id} style={{ ...s.tr, alignItems: "flex-start" }}>
                    <Text style={{ ...s.td, width: 55, color: toneFor(f.onem), fontWeight: 700 }}>
                      {COMPLIANCE_SEVERITY_LABELS[f.onem as keyof typeof COMPLIANCE_SEVERITY_LABELS]}
                    </Text>
                    <Text style={{ ...s.td, width: 110 }}>
                      {COMPLIANCE_FLAG_TYPE_LABELS[f.tur as keyof typeof COMPLIANCE_FLAG_TYPE_LABELS]}
                    </Text>
                    <Text style={{ ...s.td, flex: 1, color: MUTED }}>{f.aciklama}</Text>
                  </View>
                ))}
              </View>
            )}

            {resolvedFlags.length > 0 && (
              <View style={s.section}>
                <Text style={s.h2}>son çözülen bayraklar</Text>
                {resolvedFlags.map((f) => (
                  <View key={f.id} style={{ ...s.tr, alignItems: "flex-start" }}>
                    <Text style={{ ...s.td, width: 55, color: MUTED }}>çözüldü</Text>
                    <Text style={{ ...s.td, width: 110 }}>
                      {COMPLIANCE_FLAG_TYPE_LABELS[f.tur as keyof typeof COMPLIANCE_FLAG_TYPE_LABELS]}
                    </Text>
                    <Text style={{ ...s.td, flex: 1, color: MUTED }}>{f.cozumNotu ?? f.aciklama}</Text>
                  </View>
                ))}
              </View>
            )}
          </>
        )}

        <Footer orgName={org.name} />
      </Page>

      {/* Sayfa 3 — Kararlar */}
      <Page size="A4" style={s.page}>
        <Text style={s.eyebrow}>bölüm 3</Text>
        <Text style={s.h1}>Denetim kararları</Text>
        <Text style={{ ...s.muted, marginBottom: 12 }}>son {decisions.length} karar</Text>

        {decisions.length === 0 ? (
          <Text style={s.muted}>Bu kurum için karar kaydı yok.</Text>
        ) : (
          decisions.map((d) => (
            <View key={d.id} style={{ ...s.tr, alignItems: "flex-start" }}>
              <Text style={{ ...s.td, width: 60, color: toneForKarar(d.karar), fontWeight: 700 }}>
                {AUDIT_DECISION_TYPE_LABELS[d.karar as keyof typeof AUDIT_DECISION_TYPE_LABELS]}
              </Text>
              <Text style={{ ...s.td, width: 90, color: MUTED }}>
                {new Date(d.createdAt).toLocaleDateString("tr-TR")}
              </Text>
              <Text style={{ ...s.td, flex: 1 }}>
                {d.transaction.pool.projectName} · {d.transaction.amountTCO2e.toLocaleString("tr-TR")} tCO₂e
                {d.not ? ` — ${d.not}` : ""}
              </Text>
            </View>
          ))
        )}

        <Footer orgName={org.name} />
      </Page>
    </Document>
  );

  const buf = await renderToBuffer(doc);
  await audit(s0.sub, "UYUM_RAPORU_INDIR", "Organization", org.id, org.name, s0.email);

  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${org.name}-uyum-raporu-${new Date().toISOString().slice(0, 10)}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
