import { getScope } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader, Card, CardTitle, KpiCard, Table, Badge, EmptyState } from "@/components/ui";

export const dynamic = "force-dynamic";

/** z-score = (x - μ) / σ ; |z| ≥ 2 anomali */
function zscore(vals: number[]): { mean: number; std: number; z: (x: number) => number } {
  if (vals.length === 0) return { mean: 0, std: 0, z: () => 0 };
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  const varr = vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length;
  const std = Math.sqrt(varr);
  return { mean, std, z: (x) => (std === 0 ? 0 : (x - mean) / std) };
}

export default async function PiyasaPage() {
  const { org } = await getScope();
  if (org.type !== "KLEAF") return <Card><EmptyState title="Yalnız KLEAF denetçisi" desc="" /></Card>;

  const [tx, prices, banks] = await Promise.all([
    prisma.creditTransaction.findMany({
      where: { status: { in: ["TRANSFER", "DENETIM_ASKI"] } },
      include: {
        bankOrg: { select: { id: true, name: true } },
        buyerOrg: { select: { id: true, name: true, type: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 500,
    }),
    prisma.priceCurve.findMany({
      orderBy: [{ standard: "asc" }, { date: "desc" }],
      take: 300,
    }),
    prisma.organization.findMany({ where: { type: "KARBON_BANK" }, select: { id: true, name: true } }),
  ]);

  const fiyatlar = tx.map((t) => t.priceTRYPerTon).filter((p): p is number => typeof p === "number" && p > 0);
  const { mean, std, z } = zscore(fiyatlar);

  const anomaliler = tx
    .map((t) => ({ t, z: t.priceTRYPerTon ? z(t.priceTRYPerTon) : 0 }))
    .filter((x) => Math.abs(x.z) >= 2)
    .sort((a, b) => Math.abs(b.z) - Math.abs(a.z));

  // HHI konsantrasyon indeksi (banka pazar payı, ton bazında)
  const bankaHacim = new Map<string, { name: string; hacim: number }>();
  let toplamHacim = 0;
  for (const t of tx) {
    if (t.status !== "TRANSFER") continue;
    const cur = bankaHacim.get(t.bankOrgId) ?? { name: t.bankOrg.name, hacim: 0 };
    cur.hacim += t.amountTCO2e;
    bankaHacim.set(t.bankOrgId, cur);
    toplamHacim += t.amountTCO2e;
  }
  const paylar = Array.from(bankaHacim.values()).map((b) => ({
    ...b,
    pay: toplamHacim > 0 ? b.hacim / toplamHacim : 0,
  })).sort((a, b) => b.pay - a.pay);
  const hhi = paylar.reduce((a, p) => a + (p.pay * 100) ** 2, 0);
  const hhiEtiket = hhi < 1500 ? "düşük konsantrasyon" : hhi < 2500 ? "orta konsantrasyon" : "yüksek konsantrasyon";
  const hhiTone: "leaf" | "warm" | "danger" = hhi < 1500 ? "leaf" : hhi < 2500 ? "warm" : "danger";

  // Fiyat eğrisi — standart bazlı grup
  const standartGrup = new Map<string, typeof prices>();
  for (const p of prices) {
    const arr = standartGrup.get(p.standard) ?? [];
    arr.push(p);
    standartGrup.set(p.standard, arr);
  }

  return (
    <>
      <PageHeader
        eyebrow="piyasa gözetim"
        title="Fiyat anomalisi & pazar konsantrasyonu"
        desc={`${tx.length} işlem · ${banks.length} banka · μ=${mean.toFixed(0)}₺/tCO₂e · σ=${std.toFixed(0)}`}
      />

      <div className="rise mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="ortalama fiyat" value={mean.toLocaleString("tr-TR", { maximumFractionDigits: 0 })} unit="₺/tCO₂e" hint={`σ = ${std.toFixed(0)}`} tone="leaf" />
        <KpiCard label="fiyat anomalisi" value={String(anomaliler.length)} hint="|z| ≥ 2 işlem" tone={anomaliler.length > 0 ? "warm" : "leaf"} />
        <KpiCard label="HHI konsantrasyon" value={hhi.toFixed(0)} hint={hhiEtiket} tone={hhiTone} />
        <KpiCard label="lider banka payı" value={paylar[0] ? `%${(paylar[0].pay * 100).toFixed(1)}` : "—"} hint={paylar[0]?.name ?? ""} tone="leaf" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardTitle>Fiyat anomalisi (|z| ≥ 2)</CardTitle>
          {anomaliler.length === 0 ? (
            <EmptyState title="Anomali yok" desc="Tüm fiyatlar σ×2 bandında." />
          ) : (
            <Table head={["Alıcı", "Banka", "Fiyat", "z", "Miktar", "Tarih"]} dense>
              {anomaliler.slice(0, 20).map((a) => (
                <tr key={a.t.id}>
                  <td className="p-2">{a.t.buyerOrg?.name ?? "—"}</td>
                  <td className="p-2 text-ink/60">{a.t.bankOrg.name}</td>
                  <td className="p-2 text-right tabular-nums">{a.t.priceTRYPerTon?.toLocaleString("tr-TR", { maximumFractionDigits: 0 })}</td>
                  <td className="p-2 text-right tabular-nums">
                    <Badge tone={Math.abs(a.z) >= 3 ? "danger" : "warm"}>{a.z > 0 ? "+" : ""}{a.z.toFixed(2)}</Badge>
                  </td>
                  <td className="p-2 text-right tabular-nums">{a.t.amountTCO2e.toLocaleString("tr-TR", { maximumFractionDigits: 0 })}</td>
                  <td className="p-2 text-[11px] text-ink/50">{new Date(a.t.createdAt).toLocaleDateString("tr-TR")}</td>
                </tr>
              ))}
            </Table>
          )}
        </Card>

        <Card>
          <CardTitle>Pazar payı — banka bazında</CardTitle>
          <Table head={["Banka", "Hacim (tCO₂e)", "Pay"]} dense>
            {paylar.length === 0 ? (
              <tr><td colSpan={3} className="p-4 text-center text-ink/45">Onaylanmış işlem yok</td></tr>
            ) : paylar.map((p) => (
              <tr key={p.name}>
                <td className="p-2">{p.name}</td>
                <td className="p-2 text-right tabular-nums">{p.hacim.toLocaleString("tr-TR", { maximumFractionDigits: 0 })}</td>
                <td className="p-2 text-right tabular-nums">
                  <div className="inline-flex items-center gap-2">
                    <div className="h-1.5 w-20 overflow-hidden rounded bg-ink/5">
                      <div className="h-full rounded bg-leaf-500" style={{ width: `${p.pay * 100}%` }} />
                    </div>
                    <span>%{(p.pay * 100).toFixed(1)}</span>
                  </div>
                </td>
              </tr>
            ))}
          </Table>
          <p className="mt-3 text-[11px] text-ink/45">HHI ≥ 2500 tekelci yapıya işaret eder</p>
        </Card>
      </div>

      <div className="mt-4">
        <Card>
          <CardTitle>Fiyat eğrisi — standart × vintage (son 10 nokta)</CardTitle>
          {standartGrup.size === 0 ? <EmptyState title="Fiyat eğrisi yok" desc="" /> : (
            <div className="space-y-4">
              {Array.from(standartGrup.entries()).map(([std, arr]) => (
                <div key={std}>
                  <p className="mb-1 text-[12px] font-medium lowercase text-ink/70">{std}</p>
                  <Table head={["Vintage", "Fiyat (₺)", "Tarih", "Banka"]} dense>
                    {arr.slice(0, 10).map((p) => (
                      <tr key={p.id}>
                        <td className="p-2">{p.vintageYear}</td>
                        <td className="p-2 text-right tabular-nums">{p.priceTRYPerTon.toLocaleString("tr-TR", { maximumFractionDigits: 0 })}</td>
                        <td className="p-2 text-[11px] text-ink/50">{new Date(p.date).toLocaleDateString("tr-TR")}</td>
                        <td className="p-2 text-[11px] text-ink/50">{banks.find((b) => b.id === p.bankOrgId)?.name ?? "—"}</td>
                      </tr>
                    ))}
                  </Table>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
