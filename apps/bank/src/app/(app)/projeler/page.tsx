import { getScope } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader, Card, Table, Badge, EmptyState } from "@/components/ui";
import { fmtTons } from "@/lib/format";

const TIP: Record<string, string> = {
  AGACLANDIRMA: "ağaçlandırma", YENILENEBILIR: "yenilenebilir", ENERJI_VERIMLILIGI: "enerji verimliliği",
  METAN: "metan yakalama", BIYOKOMUR: "biyokömür", MAVI_KARBON: "mavi karbon", DAC: "doğrudan hava yakalama", TEMIZ_OCAK: "temiz ocak",
};
const STD: Record<string, string> = { GOLD_STANDARD: "Gold Standard", VCS: "Verra VCS", ULUSAL: "ulusal", CDM: "CDM", ACR: "ACR" };
const STAGE: Record<string, string> = { FIZIBILITE: "fizibilite", VALIDASYON: "validasyon", DOGRULAMA: "doğrulama", IHRAC: "ihraç", AKTIF: "aktif" };
const stageTone = (s: string): "leaf" | "warm" | "gray" => (s === "AKTIF" ? "leaf" : s === "IHRAC" || s === "DOGRULAMA" ? "warm" : "gray");
const STAGE_ORDER = ["AKTIF", "IHRAC", "DOGRULAMA", "VALIDASYON", "FIZIBILITE"];

export default async function ProjelerPage() {
  const { org } = await getScope();
  if (org.type !== "KARBON_BANK") return <Card className="rise-1"><EmptyState title="KarbonBank'a özel sayfa" desc="Belediye paneli: http://localhost:3100" /></Card>;

  const projects = await prisma.creditProject.findMany({
    where: { bankOrgId: org.id },
    include: { developer: { select: { name: true } } },
  });
  const sirali = [...projects].sort((a, b) => STAGE_ORDER.indexOf(a.stage) - STAGE_ORDER.indexOf(b.stage) || b.expectedTCO2e - a.expectedTCO2e);
  const aktif = projects.filter((p) => p.stage === "AKTIF");
  const pipeline = projects.filter((p) => p.stage !== "AKTIF");
  const beklenenHacim = pipeline.reduce((a, p) => a + p.expectedTCO2e, 0);

  return (
    <>
      <PageHeader eyebrow="portföy" title="Kredi projeleri"
        desc={`${org.name} · ${aktif.length} aktif proje · ${pipeline.length} geliştirme hattında (${fmtTons(beklenenHacim)} tCO₂e beklenen)`} />
      <Card className="rise-1">
        <Table head={<>
          <th>proje</th><th>tip</th><th>standart</th><th>bölge</th><th>vintage</th><th>aşama</th><th>beklenen tCO₂e</th><th>kalite</th><th>geliştirici</th>
        </>}>
          {sirali.map((p) => (
            <tr key={p.id}>
              <td className="font-medium text-ink">{p.name}</td>
              <td>{TIP[p.projectType] ?? p.projectType}</td>
              <td>{STD[p.standard] ?? p.standard}</td>
              <td>{p.region}</td>
              <td>{p.vintageYear}</td>
              <td><Badge tone={stageTone(p.stage)}>{STAGE[p.stage] ?? p.stage}</Badge></td>
              <td className="tabular-nums">{fmtTons(p.expectedTCO2e)}</td>
              <td>{p.qualityRating ?? "—"}</td>
              <td className="text-ink/60">{p.developer?.name ?? "—"}</td>
            </tr>
          ))}
        </Table>
      </Card>
    </>
  );
}
