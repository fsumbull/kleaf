import { requireSession, getScope } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader, Card, Table, Badge } from "@/components/ui";
import { KullaniciEkleButonu, KullaniciSatirAksiyonlari, RolSecici, AktifToggle } from "@/components/kullanici-client";
import { YetkiMatrisi } from "@/components/yetki-matrisi";
import { ROLE_LABELS, type Role } from "@/lib/constants";
import { fmtDate } from "@/lib/format";

export default async function KullanicilarPage() {
  const session = await requireSession(["SUPER_ADMIN", "SISTEM_YONETICISI"]);
  const { org, orgs } = await getScope();
  const isSuper = session.role === "SUPER_ADMIN";

  const users = await prisma.user.findMany({
    where: isSuper ? {} : { orgId: org.id },
    include: { org: { select: { name: true } }, unit: { select: { name: true } } },
    orderBy: [{ role: "asc" }, { name: "asc" }],
  });
  const units = await prisma.unit.findMany({
    where: { orgId: org.id }, select: { id: true, name: true }, orderBy: { name: "asc" },
  });

  const orgOptions = isSuper ? orgs.map((o) => ({ id: o.id, name: o.name })) : [{ id: org.id, name: org.name }];

  return (
    <>
      <PageHeader
        eyebrow="yönetim"
        title="Kullanıcılar"
        desc={isSuper ? "Platformdaki tüm kullanıcılar" : `${org.name} kullanıcıları`}
        actions={<KullaniciEkleButonu orgs={orgOptions} defaultOrgId={org.id} units={units} />}
      />
      <Card pad={false} className="rise-1">
        <Table
          head={
            <>
              <th>kullanıcı</th>
              <th>e-posta</th>
              {isSuper && <th>kurum</th>}
              <th>rol</th>
              <th>müdürlük</th>
              <th>durum</th>
              <th className="text-right">kayıt</th>
              <th className="w-44 text-right"></th>
            </>
          }
        >
          {users.map((u) => (
            <tr key={u.id}>
              <td className="font-semibold">
                <span className="inline-flex items-center gap-2.5">
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-leaf-100 text-[10.5px] font-bold text-leaf-800">
                    {u.name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase()}
                  </span>
                  {u.name}
                </span>
              </td>
              <td className="text-ink/60">{u.email}</td>
              {isSuper && <td className="text-ink/60">{u.org?.name ?? <Badge tone="gray">platform</Badge>}</td>}
              <td>
                {u.role === "SUPER_ADMIN" ? (
                  <Badge tone="warm">{ROLE_LABELS[u.role as Role]}</Badge>
                ) : (
                  <RolSecici id={u.id} role={u.role} disabled={u.id === session.sub} />
                )}
              </td>
              <td className="text-ink/60">{u.unit?.name ?? "—"}</td>
              <td>
                {u.role === "SUPER_ADMIN" ? (
                  <Badge tone="leaf">aktif</Badge>
                ) : (
                  <AktifToggle id={u.id} active={u.active} isSelf={u.id === session.sub} />
                )}
              </td>
              <td className="text-right text-[12px] text-ink/45 tabular-nums">{fmtDate(u.createdAt)}</td>
              <td className="text-right">
                {u.role === "SUPER_ADMIN" ? (
                  <span className="text-[11px] text-ink/30">korumalı</span>
                ) : (
                  <KullaniciSatirAksiyonlari id={u.id} email={u.email} isSelf={u.id === session.sub} />
                )}
              </td>
            </tr>
          ))}
        </Table>
      </Card>
      <p className="mt-4 text-[11.5px] text-ink/40">
        Roller: iklim merkezi envanteri yönetir ve nihai onayı verir · müdürlük veri sorumlusu kendi birimine taslak girer · müdürlük onaycısı ara onay verir · alan uzmanları (enerji/filo/atık) kendi kategorilerini yönetir · üst yönetim salt görüntüler · sistem yöneticisi kullanıcı ve güvenliği yönetir.
      </p>
      <div className="mt-6">
        <h2 className="mb-2 text-[15px] font-bold tracking-tight">yetki matrisi</h2>
        <Card pad={false} className="rise-2">
          <YetkiMatrisi
            users={users.map((u) => ({ id: u.id, name: u.name, email: u.email, role: u.role }))}
            selfId={session.sub}
          />
        </Card>
      </div>
    </>
  );
}
