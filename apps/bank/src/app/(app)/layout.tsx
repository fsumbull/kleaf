import { getScope } from "@/lib/auth";
import { ORG_TYPE_LABELS, type OrgType } from "@/lib/constants";
import { Sidebar, MobileNav } from "@/components/sidebar";
import { Topbar } from "@/components/topbar";
import { ChatWidget } from "@/components/chat-widget";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { session, org, year, orgs, birim, units } = await getScope();
  const product = ORG_TYPE_LABELS[org.type as OrgType]?.product ?? "kleaf";

  return (
    <div className="flex min-h-dvh">
      <Sidebar role={session.role} product={product} orgType={org.type} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          orgName={org.name}
          product={product}
          year={year}
          userName={session.name}
          role={session.role}
          orgs={orgs}
          activeOrgId={org.id}
          units={units}
          activeBirimId={birim.unitId ?? ""}
          birimKilitli={birim.kilitli}
          birimAdi={birim.adi}
        />
        <MobileNav role={session.role} orgType={org.type} />
        <main className="w-full flex-1 px-4 py-5 md:px-6 lg:px-8">{children}</main>
      </div>
      <ChatWidget />
    </div>
  );
}
