import Link from "next/link";
import { requireSession, getScope } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader, Card, Table, Badge, EmptyState } from "@/components/ui";
import { ACTION_LABELS } from "@/lib/audit-labels";
import { fmtDateTime, fmtInt } from "@/lib/format";

const PAGE_SIZE = 40;

export default async function DenetimPage({ searchParams }: {
  searchParams: Promise<{ sayfa?: string; bas?: string; bit?: string; eylem?: string; kullanici?: string }>;
}) {
  const session = await requireSession(["SUPER_ADMIN", "SISTEM_YONETICISI", "IKLIM_MERKEZI"]);
  const { org } = await getScope();
  const isSuper = session.role === "SUPER_ADMIN";
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.sayfa) || 1);
  const eylem = sp.eylem?.trim() || undefined;
  const kullanici = sp.kullanici?.trim() || undefined;
  const basD = sp.bas ? new Date(`${sp.bas}T00:00:00`) : undefined;
  const bitD = sp.bit ? new Date(`${sp.bit}T23:59:59.999`) : undefined;

  // kurum admini yalnızca kendi kurumundaki kullanıcıların izlerini görür
  const where = {
    ...(isSuper ? {} : { user: { orgId: org.id } }),
    ...(eylem ? { action: eylem } : {}),
    ...(kullanici ? {
      OR: [
        { user: { email: { contains: kullanici } } },
        { user: { name: { contains: kullanici } } },
        { actorEmail: { contains: kullanici } },
      ],
    } : {}),
    ...(basD || bitD ? {
      createdAt: {
        ...(basD && !isNaN(+basD) ? { gte: basD } : {}),
        ...(bitD && !isNaN(+bitD) ? { lte: bitD } : {}),
      },
    } : {}),
  };

  const [total, logs] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      include: { user: { select: { name: true, email: true } } },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const csvQs = new URLSearchParams();
  if (sp.bas) csvQs.set("bas", sp.bas);
  if (sp.bit) csvQs.set("bit", sp.bit);
  if (eylem) csvQs.set("eylem", eylem);
  if (kullanici) csvQs.set("kullanici", kullanici);

  const pageQs = (p: number) => {
    const q = new URLSearchParams(csvQs);
    q.set("sayfa", String(p));
    return `/denetim?${q.toString()}`;
  };

  const filterInput =
    "rounded-xl border border-leaf-200/70 bg-white/80 px-3 py-1.5 text-[12.5px] text-ink outline-none transition focus:border-leaf-400 focus:ring-2 focus:ring-leaf-100";
  const hasFilter = Boolean(sp.bas || sp.bit || eylem || kullanici);

  return (
    <>
      <PageHeader
        eyebrow="yönetim"
        title="Denetim izi"
        desc={`${fmtInt(total)} kayıt · ${isSuper ? "tüm platform" : org.name} — kim, ne zaman, neyi değiştirdi`}
        actions={
          <a href={`/api/denetim/csv?${csvQs.toString()}`}
            className="rounded-xl border border-leaf-200 bg-white/70 px-3.5 py-2 text-[12.5px] font-medium text-leaf-700 transition hover:bg-leaf-50">
            ⬇ CSV indir{hasFilter ? " (filtreli)" : ""}
          </a>
        }
      />

      <Card className="rise mb-4">
        <form method="get" action="/denetim" className="flex flex-wrap items-end gap-3">
          <label className="block">
            <span className="mb-1 block text-[11px] font-medium lowercase tracking-wide text-ink/50">başlangıç</span>
            <input type="date" name="bas" defaultValue={sp.bas ?? ""} className={filterInput} />
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] font-medium lowercase tracking-wide text-ink/50">bitiş</span>
            <input type="date" name="bit" defaultValue={sp.bit ?? ""} className={filterInput} />
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] font-medium lowercase tracking-wide text-ink/50">işlem</span>
            <select name="eylem" defaultValue={eylem ?? ""} className={filterInput}>
              <option value="">tümü</option>
              {Object.entries(ACTION_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] font-medium lowercase tracking-wide text-ink/50">kullanıcı (ad / e-posta)</span>
            <input type="text" name="kullanici" defaultValue={kullanici ?? ""} placeholder="ör. demo@" className={filterInput} />
          </label>
          <div className="flex gap-2">
            <button type="submit"
              className="cursor-pointer rounded-xl bg-leaf-600 px-4 py-2 text-[12.5px] font-semibold text-white transition hover:bg-leaf-700">
              filtrele
            </button>
            {hasFilter && (
              <Link href="/denetim"
                className="rounded-xl px-3 py-2 text-[12.5px] font-medium text-ink/50 transition hover:bg-ink/5">
                temizle
              </Link>
            )}
          </div>
        </form>
      </Card>

      {logs.length === 0 ? (
        <EmptyState title={hasFilter ? "Filtreye uyan kayıt yok" : "Henüz denetim kaydı yok"}
          desc={hasFilter ? "Tarih aralığını genişletmeyi ya da filtreyi temizlemeyi deneyin." : "Kullanıcılar işlem yaptıkça burada listelenir."} />
      ) : (
        <Card pad={false} className="rise-1">
          <Table
            dense
            head={
              <>
                <th>zaman</th>
                <th>kullanıcı</th>
                <th>işlem</th>
                <th>nesne</th>
                <th>ayrıntı</th>
              </>
            }
          >
            {logs.map((l) => {
              const meta = ACTION_LABELS[l.action] ?? { label: l.action.toLowerCase().replaceAll("_", " "), tone: "gray" as const };
              return (
                <tr key={l.id}>
                  <td className="whitespace-nowrap text-[12px] text-ink/50 tabular-nums">{fmtDateTime(l.createdAt)}</td>
                  <td>
                    {l.user ? (
                      <span title={l.user.email} className="font-medium">{l.user.name}</span>
                    ) : l.actorEmail ? (
                      <span className="text-ink/50" title="silinmiş kullanıcı">{l.actorEmail}</span>
                    ) : (
                      <span className="text-ink/30">silinmiş kullanıcı</span>
                    )}
                  </td>
                  <td><Badge tone={meta.tone}>{meta.label}</Badge></td>
                  <td className="text-[12px] text-ink/50">{l.entity}{l.entityId ? ` · ${l.entityId.slice(-6)}` : ""}</td>
                  <td className="max-w-[320px] truncate text-[12px] text-ink/60" title={l.detail ?? ""}>{l.detail ?? "—"}</td>
                </tr>
              );
            })}
          </Table>
          <div className="flex items-center justify-between border-t border-leaf-100/70 px-5 py-3 text-[12px] text-ink/50">
            <span>sayfa {page} / {pages}</span>
            <span className="inline-flex gap-2">
              {page > 1 && (
                <Link href={pageQs(page - 1)} className="rounded-lg px-2.5 py-1 transition hover:bg-leaf-50 hover:text-leaf-800">
                  ← önceki
                </Link>
              )}
              {page < pages && (
                <Link href={pageQs(page + 1)} className="rounded-lg px-2.5 py-1 transition hover:bg-leaf-50 hover:text-leaf-800">
                  sonraki →
                </Link>
              )}
            </span>
          </div>
        </Card>
      )}
    </>
  );
}
