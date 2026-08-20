/**
 * Sistem yönetimi — yalnızca SUPER_ADMIN.
 * Sürüm bilgisi, kayıt sayıları, veritabanı boyutu, yedek indirme ve lisans kartı.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CALC_VERSION } from "@/lib/carbon/engine";
import { PageHeader, Card, CardTitle, KpiCard, Table, Badge } from "@/components/ui";
import { fmtInt, fmtDateTime } from "@/lib/format";
import pkg from "../../../../package.json";

export const dynamic = "force-dynamic";

async function dbSizeMB(): Promise<number | null> {
  const url = process.env.DATABASE_URL ?? "";
  const m = url.match(/^file:(.+)$/);
  if (!m) return null; // SQLite dışı (ör. Postgres) — boyut gösterilmez
  const p = path.isAbsolute(m[1]) ? m[1] : path.join(process.cwd(), "prisma", m[1]);
  try {
    const st = await fs.stat(p);
    return st.size / (1024 * 1024);
  } catch {
    return null;
  }
}

export default async function SistemPage() {
  await requireSession(["SUPER_ADMIN"]);

  const [orgCount, userCount, facilityCount, actCount, recCount, auditCount, factorCount, lastAudit, size] =
    await Promise.all([
      prisma.organization.count(),
      prisma.user.count(),
      prisma.facility.count(),
      prisma.activityData.count(),
      prisma.emissionRecord.count(),
      prisma.auditLog.count(),
      prisma.emissionFactor.count(),
      prisma.auditLog.findFirst({ orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
      dbSizeMB(),
    ]);

  const licenseKey = process.env.LICENSE_KEY ?? null;
  const counts: [string, number][] = [
    ["kurum", orgCount],
    ["kullanıcı", userCount],
    ["tesis", facilityCount],
    ["faaliyet kaydı", actCount],
    ["emisyon hesabı", recCount],
    ["emisyon faktörü", factorCount],
    ["denetim kaydı", auditCount],
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="sistem"
        title="Sistem yönetimi"
        desc="on-premise kurulum durumu · sürüm, veri hacmi ve yedekleme"
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="uygulama sürümü" value={`v${pkg.version}`} hint={`hesap motoru v${CALC_VERSION}`} />
        <KpiCard label="veritabanı boyutu" value={size === null ? "—" : size.toFixed(1)} unit={size === null ? undefined : "MB"}
          hint={size === null ? "harici veritabanı" : "SQLite dosyası"} />
        <KpiCard label="toplam faaliyet kaydı" value={fmtInt(actCount)} unit="adet" hint={`${fmtInt(recCount)} emisyon hesabı`} />
        <KpiCard label="son denetim olayı" value={lastAudit ? fmtDateTime(lastAudit.createdAt) : "—"}
          hint={`${fmtInt(auditCount)} kayıtlı olay`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
        <Card pad={false}>
          <div className="px-5 pt-5">
            <CardTitle right={<span className="text-[11px] text-ink/40">tablolara göre kayıt sayıları</span>}>veri hacmi</CardTitle>
          </div>
          <Table dense head={<><th>tablo</th><th>kayıt</th></>}>
            {counts.map(([label, n]) => (
              <tr key={label}>
                <td className="font-medium">{label}</td>
                <td className="tabular-nums">{fmtInt(n)}</td>
              </tr>
            ))}
          </Table>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardTitle>yedekleme</CardTitle>
            <p className="mb-3 text-[12.5px] text-ink/55">
              SQLite dosyası olduğu gibi indirilir; kurum dışına çıkarmadan önce KVKK gereksinimlerini gözetin.
              Düzenli yedek için sunucuda zamanlanmış görev önerilir.
            </p>
            <a
              href="/api/sistem/yedek"
              className="inline-flex items-center gap-2 rounded-xl bg-leaf-600 px-4 py-2 text-[13px] font-medium text-white shadow-[0_8px_18px_-8px_rgba(22,163,74,0.6)] transition hover:bg-leaf-700"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 3v12m0 0l-4-4m4 4l4-4M4 21h16" />
              </svg>
              yedek indir (.db)
            </a>
          </Card>

          <Card>
            <CardTitle right={<span className="text-[11px] text-ink/40">LICENSE_KEY ortam değişkeni</span>}>lisans</CardTitle>
            {licenseKey ? (
              <div className="flex items-center gap-2">
                <Badge tone="leaf">etkin</Badge>
                <code className="text-[12px] text-ink/60">{licenseKey.slice(0, 4)}••••{licenseKey.slice(-4)}</code>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Badge tone="warm">tanımsız</Badge>
                <span className="text-[12.5px] text-ink/55">deneme kipinde çalışıyor — üretimde LICENSE_KEY tanımlayın</span>
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
