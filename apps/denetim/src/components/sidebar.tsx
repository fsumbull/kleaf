"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Brand } from "./logo";
import type { Role } from "@/lib/constants";

interface NavItem { href: string; label: string; icon: string; roles?: Role[]; orgTypes?: string[] }

const NAV: { group: string; items: NavItem[] }[] = [
  {
    group: "denetim",
    items: [
      { href: "/", label: "ulusal genel bakış", icon: "M4 19V9m5.5 10V5M15 19v-8m5.5 8V12" },
      { href: "/kredi-denetimi", label: "kredi denetimi", icon: "M4 6a2 2 0 012-2h12a2 2 0 012 2v12a2 2 0 01-2 2H6a2 2 0 01-2-2zM8 8h8m-8 4h8m-8 4h5" },
      { href: "/bayraklar", label: "uyum bayrakları", icon: "M4 21V4m0 0h11l3 5-3 5H4" },
      { href: "/uyum-raporu", label: "uyum raporu", icon: "M7 3h7l4 4v14H7zM14 3v5h5" },
      { href: "/denetim", label: "birleşik denetim izi", icon: "M12 8v5l3 2M12 21a9 9 0 110-18 9 9 0 010 18z" },
    ],
  },
  {
    group: "analitik",
    items: [
      { href: "/ulusal-envanter", label: "ulusal envanter", icon: "M3 3v18h18M7 15l4-4 3 3 5-6" },
      { href: "/kiyas", label: "belediye kıyas", icon: "M8 13v5m4-9v9m4-13v13M4 21h16" },
      { href: "/risk-skorlari", label: "risk skorları", icon: "M12 2l2.6 5.3 5.9.9-4.2 4.1 1 5.8L12 15.4 6.7 18l1-5.8-4.2-4.1 5.9-.9z" },
      { href: "/faktor-denetim", label: "faktör denetimi", icon: "M4 4h4v4H4zM10 4h10v2H10zM10 10h10v2H10zM10 16h10v2H10zM4 10h4v4H4zM4 16h4v4H4z" },
      { href: "/piyasa", label: "piyasa gözetim", icon: "M3 17l6-6 4 4 8-8M14 7h7v7" },
      { href: "/kamu-portal-denetim", label: "portal denetimi", icon: "M12 21c4.97 0 9-4.03 9-9s-4.03-9-9-9-9 4.03-9 9 4.03 9 9 9zM3 12h18M12 3a15 15 0 010 18M12 3a15 15 0 000 18" },
      { href: "/mevzuat", label: "mevzuat & bildirim", icon: "M6 3h12v18l-3-3-3 3-3-3-3 3zM9 7h6M9 11h6M9 15h4" },
    ],
  },
  {
    group: "yönetim",
    items: [
      { href: "/kurumlar", label: "kurumlar", icon: "M3 21h18M5 21V7l5-4v18m4 0V11l5 3v7", roles: ["SUPER_ADMIN"] },
      { href: "/kullanicilar", label: "kullanıcılar", icon: "M16 19a4 4 0 00-8 0M12 11a3.5 3.5 0 100-7 3.5 3.5 0 000 7z", roles: ["SUPER_ADMIN", "KLEAF_ADMIN"] },
      { href: "/ayarlar", label: "ayarlar", icon: "M12 15a3 3 0 100-6 3 3 0 000 6zM19 12a7 7 0 01-.1 1.2l2 1.6-2 3.4-2.4-1a7 7 0 01-2 1.2L14 21h-4l-.4-2.6a7 7 0 01-2-1.2l-2.5 1-2-3.4 2-1.6A7 7 0 015 12a7 7 0 01.1-1.2l-2-1.6 2-3.4 2.4 1a7 7 0 012-1.2L10 3h4l.4 2.6a7 7 0 012 1.2l2.5-1 2 3.4-2 1.6c.06.4.1.8.1 1.2z", roles: ["SUPER_ADMIN", "KLEAF_ADMIN"] },
    ],
  },
];

export function Sidebar({ role, product }: { role: Role; product: string; orgType?: string }) {
  const pathname = usePathname();
  return (
    <aside className="sticky top-0 hidden h-dvh w-[248px] shrink-0 flex-col gap-5 border-r border-leaf-200/50 bg-white/45 px-4 py-5 backdrop-blur-xl lg:flex">
      <Link href="/" className="px-2">
        <Brand sub={product} />
      </Link>

      <nav className="flex flex-1 flex-col gap-4 overflow-y-auto">
        {NAV.map((g) => {
          const items = g.items.filter((i) => !i.roles || i.roles.includes(role));
          if (!items.length) return null;
          return (
            <div key={g.group}>
              <p className="eyebrow mb-1.5 px-2">{g.group}</p>
              <ul className="space-y-1">
                {items.map((item) => {
                  const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13.5px] transition ${
                          active
                            ? "bg-leaf-600 font-medium text-white shadow-[0_8px_18px_-8px_rgba(22,163,74,0.6)]"
                            : "text-ink/65 hover:bg-leaf-100/70 hover:text-ink"
                        }`}
                      >
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
                          stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"
                          className={`shrink-0 ${active ? "opacity-95" : "opacity-60 group-hover:opacity-90"}`}>
                          <path d={item.icon} />
                        </svg>
                        {item.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </nav>

      <p className="px-2 text-[10.5px] leading-relaxed text-ink/35">
        Kleaf Denetim — gözetim ve otorite paneli
      </p>
    </aside>
  );
}

/** Dar ekranlar için yatay kaydırmalı gezinme şeridi. */
export function MobileNav({ role }: { role: Role; orgType?: string }) {
  const pathname = usePathname();
  const items = NAV.flatMap((g) => g.items).filter((i) => !i.roles || i.roles.includes(role));
  return (
    <nav className="sticky top-[57px] z-30 flex gap-1.5 overflow-x-auto border-b border-leaf-200/50 bg-white/55 px-4 py-2 backdrop-blur-xl lg:hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {items.map((item) => {
        const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href} href={item.href}
            className={`shrink-0 rounded-full px-3.5 py-1.5 text-[12px] transition ${
              active ? "bg-leaf-600 font-medium text-white" : "text-ink/60 hover:bg-leaf-100"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
