/* Entegrasyon merkezi — API anahtarları ve ingest endpoint dokümantasyonu */
import { requireSession, getScope } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader, Card, CardTitle, Table, Badge } from "@/components/ui";
import { AnahtarOlustur, AnahtarAksiyon } from "@/components/entegrasyon-client";
import { fmtDateTime } from "@/lib/format";

export default async function EntegrasyonPage() {
  await requireSession(["SUPER_ADMIN", "SISTEM_YONETICISI"]);
  const { org } = await getScope();

  const keys = await prisma.apiKey.findMany({
    where: { orgId: org.id },
    orderBy: { createdAt: "desc" },
  });

  return (
    <>
      <PageHeader
        eyebrow="entegrasyon merkezi"
        title="API anahtarları"
        desc={`${org.name} · sayaç/SCADA gibi harici sistemlerden otomatik veri alımı`}
      />

      <Card className="rise mb-5">
        <CardTitle>yeni anahtar</CardTitle>
        <AnahtarOlustur />
      </Card>

      <Card pad={false} className="rise-1 mb-5">
        <Table
          head={<>
            <th>ad</th><th>önek</th><th>durum</th><th>son kullanım</th><th className="text-right">oluşturulma</th><th className="w-40 text-right"></th>
          </>}
        >
          {keys.length === 0 && (
            <tr><td colSpan={6} className="py-6 text-center text-ink/45">Henüz API anahtarı yok.</td></tr>
          )}
          {keys.map((k) => (
            <tr key={k.id}>
              <td className="font-semibold">{k.name}</td>
              <td><code className="font-mono text-[12px] text-ink/60">{k.prefix}…</code></td>
              <td>{k.active ? <Badge tone="leaf">aktif</Badge> : <Badge tone="gray">pasif</Badge>}</td>
              <td className="text-ink/55">{k.lastUsedAt ? fmtDateTime(k.lastUsedAt) : "hiç kullanılmadı"}</td>
              <td className="text-right text-[12px] text-ink/45">{fmtDateTime(k.createdAt)}</td>
              <td className="text-right"><AnahtarAksiyon id={k.id} active={k.active} /></td>
            </tr>
          ))}
        </Table>
      </Card>

      <Card className="rise-2">
        <CardTitle>ingest endpoint</CardTitle>
        <p className="mb-2 text-[12.5px] text-ink/55">
          Harici sistemler aşağıdaki uca <code className="font-mono text-[12px]">Authorization: Bearer &lt;anahtar&gt;</code> başlığı ile ölçüm gönderir. Kayıtlar <b>taslak</b> olarak açılır ve olağan onay akışından geçer; kapalı dönemlere yazılamaz.
        </p>
        <pre className="overflow-x-auto rounded-xl bg-ink/[0.04] p-4 font-mono text-[11.5px] leading-relaxed text-ink/75">{`POST /api/v1/olcum
Authorization: Bearer kk_xxxxxxxx...
Content-Type: application/json

{
  "facilityId": "tesis-id",
  "year": 2025, "month": 6,
  "category": "ELEKTRIK",
  "amount": 12500,
  "documentRef": "SAYAC-2025-06"
}`}</pre>
      </Card>
    </>
  );
}
