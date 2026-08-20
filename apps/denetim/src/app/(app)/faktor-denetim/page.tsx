import { getScope } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader, Card, CardTitle, Table, Badge, EmptyState, KpiCard } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function FaktorDenetimPage() {
  const { org } = await getScope();
  if (org.type !== "KLEAF") return <Card><EmptyState title="Yalnız KLEAF denetçisi" desc="" /></Card>;

  const faktorler = await prisma.emissionFactor.findMany({
    include: { org: { select: { name: true, type: true } } },
    orderBy: [{ category: "asc" }, { year: "desc" }],
  });

  // Kategori bazlı: küresel (orgId null) baz + kurum override'ları
  const kuresel = faktorler.filter((f) => !f.orgId);
  const ozel = faktorler.filter((f) => !!f.orgId);

  // En güncel küresel: kategoriye göre en yüksek yıl
  const kuresel_en_guncel = new Map<string, typeof kuresel[number]>();
  for (const f of kuresel) {
    const cur = kuresel_en_guncel.get(f.category);
    if (!cur || f.year > cur.year) kuresel_en_guncel.set(f.category, f);
  }

  // Sapma analizi: kurum override × en güncel küresel
  type Sapma = {
    id: string; category: string; unit: string; kurum: string; kurumDeger: number;
    kuresel: number | null; sapmaPct: number | null; scope: number; year: number; source: string;
  };
  const sapmalar: Sapma[] = ozel.map((f) => {
    const k = kuresel_en_guncel.get(f.category);
    const sapma = k ? ((f.kgCO2ePerUnit - k.kgCO2ePerUnit) / k.kgCO2ePerUnit) * 100 : null;
    return {
      id: f.id,
      category: f.category,
      unit: f.unit,
      kurum: f.org?.name ?? "—",
      kurumDeger: f.kgCO2ePerUnit,
      kuresel: k?.kgCO2ePerUnit ?? null,
      sapmaPct: sapma,
      scope: f.scope,
      year: f.year,
      source: f.source,
    };
  }).sort((a, b) => Math.abs(b.sapmaPct ?? 0) - Math.abs(a.sapmaPct ?? 0));

  const uyariEsigi = 20; // %20+
  const uyariSay = sapmalar.filter((s) => s.sapmaPct !== null && Math.abs(s.sapmaPct) >= uyariEsigi).length;

  return (
    <>
      <PageHeader
        eyebrow="faktör denetimi"
        title="Emisyon faktör kütüphanesi & kurum override'ları"
        desc={`${kuresel.length} küresel · ${ozel.length} kurum-özel · %${uyariEsigi}+ sapma uyarısı`}
      />

      <div className="rise mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="küresel faktör" value={String(kuresel.length)} hint="IPCC / DEFRA / TEİAŞ" tone="leaf" />
        <KpiCard label="kurum-özel override" value={String(ozel.length)} hint={`${new Set(ozel.map((f) => f.orgId)).size} kurum`} tone="leaf" />
        <KpiCard label="≥ %20 sapma" value={String(uyariSay)} hint="denetim gerektiren override" tone={uyariSay > 0 ? "warm" : "leaf"} />
        <KpiCard label="kapsam dağılımı" value={`${kuresel.filter((f) => f.scope === 1).length}/${kuresel.filter((f) => f.scope === 2).length}/${kuresel.filter((f) => f.scope === 3).length}`} hint="k1 / k2 / k3" tone="leaf" />
      </div>

      <Card>
        <CardTitle right={<span className="text-[11px] text-ink/45">%20+ sapmalar sarı, %50+ sapmalar kırmızı</span>}>
          Kurum override&apos;ları — küresel bazla karşılaştırma
        </CardTitle>
        {sapmalar.length === 0 ? (
          <EmptyState title="Kurum-özel faktör yok" desc="Tüm kurumlar küresel kütüphaneyi kullanıyor." />
        ) : (
          <Table head={["Kategori", "Kurum", "Kurum değeri", "Küresel baz", "Sapma", "Kapsam", "Yıl", "Kaynak"]} dense>
            {sapmalar.map((s) => {
              const uyari = s.sapmaPct !== null && Math.abs(s.sapmaPct) >= uyariEsigi;
              const kritik = s.sapmaPct !== null && Math.abs(s.sapmaPct) >= 50;
              return (
                <tr key={s.id} className={kritik ? "bg-red-50/50" : uyari ? "bg-amber-50/40" : ""}>
                  <td className="p-2 lowercase">{s.category.toLowerCase()}</td>
                  <td className="p-2">{s.kurum}</td>
                  <td className="p-2 text-right tabular-nums">{s.kurumDeger.toFixed(4)} <span className="text-ink/40">/{s.unit}</span></td>
                  <td className="p-2 text-right tabular-nums text-ink/60">{s.kuresel !== null ? s.kuresel.toFixed(4) : "—"}</td>
                  <td className="p-2 text-right tabular-nums">
                    {s.sapmaPct === null ? "—" : (
                      <Badge tone={kritik ? "danger" : uyari ? "warm" : "leaf"}>
                        {s.sapmaPct > 0 ? "+" : ""}{s.sapmaPct.toFixed(1)}%
                      </Badge>
                    )}
                  </td>
                  <td className="p-2 text-center">{s.scope}</td>
                  <td className="p-2 text-center">{s.year}</td>
                  <td className="p-2 text-[11px] text-ink/50">{s.source}</td>
                </tr>
              );
            })}
          </Table>
        )}
      </Card>

      <div className="mt-4">
        <Card>
          <CardTitle>Küresel faktör kütüphanesi — kategori başına en güncel</CardTitle>
          <Table head={["Kategori", "Değer", "Birim", "Kapsam", "Yıl", "Kaynak"]} dense>
            {Array.from(kuresel_en_guncel.values()).sort((a, b) => a.category.localeCompare(b.category)).map((f) => (
              <tr key={f.id}>
                <td className="p-2 lowercase">{f.category.toLowerCase()}</td>
                <td className="p-2 text-right tabular-nums">{f.kgCO2ePerUnit.toFixed(4)}</td>
                <td className="p-2">kgCO₂e/{f.unit}</td>
                <td className="p-2 text-center">{f.scope}</td>
                <td className="p-2 text-center">{f.year}</td>
                <td className="p-2 text-[11px] text-ink/50">{f.source}</td>
              </tr>
            ))}
          </Table>
        </Card>
      </div>
    </>
  );
}
