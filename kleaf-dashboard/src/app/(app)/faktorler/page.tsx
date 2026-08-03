import { getScope } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { categoryLabel } from "@/lib/data";
import { PageHeader, Card, CardTitle, Table, Badge } from "@/components/ui";
import { FactorActions, EditFactorButton, DeleteFactorButton } from "@/components/faktor-client";
import { SCOPE_LABELS } from "@/lib/constants";
import { fmt2 } from "@/lib/format";

export default async function FaktorlerPage() {
  const { session, org } = await getScope();

  const factors = await prisma.emissionFactor.findMany({
    where: { OR: [{ orgId: null }, { orgId: org.id }] },
    orderBy: [{ category: "asc" }, { year: "desc" }],
  });

  const orgFactors = factors.filter((f) => f.orgId === org.id);
  const globalFactors = factors.filter((f) => f.orgId === null);
  const overridden = new Set(orgFactors.map((f) => f.category));
  const canManage = ["SUPER_ADMIN", "IKLIM_MERKEZI"].includes(session.role);

  return (
    <>
      <PageHeader
        eyebrow="emisyon faktörleri"
        title="Faktör kütüphanesi"
        desc="Onay anında etkin faktör kayda sabitlenir (snapshot) — geçmiş hesaplar sonradan değişmez. Kurum faktörü, küresel varsayılanı geçersiz kılar."
        actions={<FactorActions orgId={org.id} canManage={canManage} />}
      />

      {orgFactors.length > 0 && (
        <Card className="rise-1 mb-5" pad={false}>
          <div className="p-5 pb-0">
            <CardTitle right={<Badge tone="leaf">{orgFactors.length} tanım</Badge>}>kuruma özel faktörler</CardTitle>
          </div>
          <div className="p-4 pt-0">
            <Table dense head={<>
              <th>kategori</th><th className="text-right">kgCO₂e / birim</th>
              <th>birim</th><th>kapsam</th><th>kaynak</th><th className="text-right">yıl</th><th></th>
            </>}>
              {orgFactors.map((f) => (
                <tr key={f.id}>
                  <td className="font-medium">{categoryLabel(f.category)}</td>
                  <td className="text-right tabular-nums">{fmt2(f.kgCO2ePerUnit)}</td>
                  <td className="text-ink/50">{f.unit}</td>
                  <td className="text-ink/50">{f.scope}</td>
                  <td className="max-w-[280px] truncate text-ink/60">{f.source}</td>
                  <td className="text-right tabular-nums text-ink/50">{f.year}</td>
                  <td className="whitespace-nowrap text-right">
                    {canManage && (
                      <>
                        <EditFactorButton factor={{
                          id: f.id, category: f.category, categoryLabel: categoryLabel(f.category),
                          unit: f.unit, kgCO2ePerUnit: f.kgCO2ePerUnit, source: f.source, year: f.year,
                        }} />
                        <DeleteFactorButton id={f.id} />
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </Table>
          </div>
        </Card>
      )}

      <Card className="rise-2" pad={false}>
        <div className="p-5 pb-0">
          <CardTitle right={<Badge tone="gray">salt okunur</Badge>}>küresel varsayılanlar</CardTitle>
        </div>
        <div className="p-4 pt-0">
          <Table dense head={<>
            <th>kategori</th><th className="text-right">kgCO₂e / birim</th>
            <th>birim</th><th>kapsam</th><th>kaynak</th><th className="text-right">yıl</th><th></th>
          </>}>
            {globalFactors.map((f) => (
              <tr key={f.id} className={overridden.has(f.category) ? "opacity-45" : ""}>
                <td className="font-medium">{categoryLabel(f.category)}</td>
                <td className="text-right tabular-nums">{fmt2(f.kgCO2ePerUnit)}</td>
                <td className="text-ink/50">{f.unit}</td>
                <td className="text-ink/50" title={SCOPE_LABELS[f.scope as 1 | 2 | 3]}>{f.scope}</td>
                <td className="max-w-[280px] truncate text-ink/60">{f.source}</td>
                <td className="text-right tabular-nums text-ink/50">{f.year}</td>
                <td className="text-right">
                  {overridden.has(f.category) && <Badge tone="warm">geçersiz kılındı</Badge>}
                </td>
              </tr>
            ))}
          </Table>
        </div>
      </Card>
    </>
  );
}
