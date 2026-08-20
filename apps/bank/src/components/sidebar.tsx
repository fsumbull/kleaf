"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Brand } from "./logo";
import type { Role } from "@/lib/constants";

interface NavItem { href: string; label: string; icon: string; roles?: Role[]; orgTypes?: string[] }

const NAV: { group: string; items: NavItem[] }[] = [
  {
    group: "banka",
    items: [
      { href: "/", label: "genel bakış", icon: "M4 19V9m5.5 10V5M15 19v-8m5.5 8V12", orgTypes: ["KARBON_BANK"] },
      { href: "/projeler", label: "kredi projeleri", icon: "M4 6a2 2 0 012-2h12a2 2 0 012 2v12a2 2 0 01-2 2H6a2 2 0 01-2-2zM8 8h8m-8 4h8m-8 4h5", orgTypes: ["KARBON_BANK"] },
      { href: "/banka", label: "kredi havuzları", icon: "M3 10l9-6 9 6M5 10v8m4.5-8v8m5-8v8M19 10v8M3 20h18M12 7.5h.01", orgTypes: ["KARBON_BANK"] },
      { href: "/ticaret", label: "ticaret masası", icon: "M3 3v18h18M7 15l3-3 3 3 5-6", orgTypes: ["KARBON_BANK"] },
      { href: "/musteriler", label: "müşteriler", icon: "M16 19a4 4 0 00-8 0M12 11a3.5 3.5 0 100-7 3.5 3.5 0 000 7z", orgTypes: ["KARBON_BANK"] },
      { href: "/gelistiriciler", label: "proje geliştiriciler", icon: "M12 3l8 4v6c0 5-3.5 7.5-8 9-4.5-1.5-8-4-8-9V7z", orgTypes: ["KARBON_BANK"] },
      { href: "/sube-haritasi", label: "şube haritası", icon: "M9 20l-6-2V4l6 2m0 14l6-2m-6 2V6m6 12l6 2V6l-6-2m0 14V4M9 6l6-2", orgTypes: ["KARBON_BANK"] },
    ],
  },
  {
    group: "kurumsal ayak izi",
    items: [
      { href: "/tesisler", label: "şubeler ve tesisler", icon: "M4 20V8l6-4 6 4v12M4 20h16M9 20v-5h6v5", orgTypes: ["KARBON_BANK"] },
      { href: "/veri-girisi", label: "veri girişi", icon: "M12 5v14m-7-7h14", orgTypes: ["KARBON_BANK"] },
      { href: "/veri-kalite", label: "veri kalitesi", icon: "M9 12l2 2 4-4m5.6 2A9 9 0 1112 3a9 9 0 018.6 9z", orgTypes: ["KARBON_BANK"] },
      { href: "/faktorler", label: "emisyon faktörleri", icon: "M4 6h16M6 12h12M9 18h6", orgTypes: ["KARBON_BANK"] },
      { href: "/raporlar", label: "raporlar", icon: "M7 3h7l4 4v14H7zM14 3v5h5", orgTypes: ["KARBON_BANK"] },
    ],
  },
  {
    group: "izleme",
    items: [
      { href: "/", label: "genel bakış", icon: "M4 19V9m5.5 10V5M15 19v-8m5.5 8V12", orgTypes: ["BELEDIYE"] },
      { href: "/veri-girisi", label: "veri girişi", icon: "M12 5v14m-7-7h14", orgTypes: ["BELEDIYE"] },
      { href: "/veri-kalite", label: "veri kalitesi", icon: "M9 12l2 2 4-4m5.6 2A9 9 0 1112 3a9 9 0 018.6 9z", orgTypes: ["BELEDIYE"] },
      { href: "/tesisler", label: "tesisler", icon: "M4 20V8l6-4 6 4v12M4 20h16M9 20v-5h6v5", orgTypes: ["BELEDIYE"] },
      { href: "/binalar", label: "binalar", icon: "M3 21h18M5 21V5a1 1 0 011-1h7a1 1 0 011 1v16m0-11h4a1 1 0 011 1v10M8 8h2m-2 4h2m-2 4h2", orgTypes: ["BELEDIYE"] },
      { href: "/filo", label: "araç filosu", icon: "M3 16l2-5.5A2 2 0 016.9 9h10.2a2 2 0 011.9 1.5L21 16v4h-2.5M3 16v4h2.5M3 16h18M7 20a1.5 1.5 0 100-3 1.5 1.5 0 000 3zm10 0a1.5 1.5 0 100-3 1.5 1.5 0 000 3z", orgTypes: ["BELEDIYE"] },
      { href: "/atik", label: "atık yönetimi", icon: "M4 7h16M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2m3 0l-1 13a1 1 0 01-1 1H8a1 1 0 01-1-1L6 7m4 4v6m4-6v6", orgTypes: ["BELEDIYE"] },
      { href: "/atiksu", label: "atıksu", icon: "M12 3s6 7 6 11a6 6 0 11-12 0c0-4 6-11 6-11z", orgTypes: ["BELEDIYE"] },
      { href: "/ges", label: "güneş enerjisi", icon: "M12 3v2m0 14v2M5.2 5.2l1.4 1.4m10.8 10.8l1.4 1.4M3 12h2m14 0h2M5.2 18.8l1.4-1.4M17.4 6.6l1.4-1.4M12 8a4 4 0 100 8 4 4 0 000-8z", orgTypes: ["BELEDIYE"] },
      { href: "/kent", label: "kent ölçeği", icon: "M3 21h18M4 21V10l4-2v13m0 0V8l5-3v16m0 0V12l5 2v7", orgTypes: ["BELEDIYE"] },
      { href: "/harita", label: "emisyon haritası", icon: "M9 20l-6-2V4l6 2m0 14l6-2m-6 2V6m6 12l6 2V6l-6-2m0 14V4M9 6l6-2", orgTypes: ["BELEDIYE"] },
      { href: "/envanter", label: "envanter kataloğu", icon: "M4 6a2 2 0 012-2h12a2 2 0 012 2v12a2 2 0 01-2 2H6a2 2 0 01-2-2zM8 8h8m-8 4h8m-8 4h5", orgTypes: ["BELEDIYE"] },
    ],
  },
  {
    group: "planlama",
    items: [
      { href: "/karbon-kredi", label: "karbon kredisi", icon: "M12 3a9 9 0 109 9M12 3v9l6.4-6.4M12 3a9 9 0 016.4 2.6M8.5 13.5l2 2 4-4", orgTypes: ["BELEDIYE"] },
      { href: "/eylem-plani", label: "eylem planı", icon: "M5 12l4 4L19 6", orgTypes: ["BELEDIYE"] },
      { href: "/senaryolar", label: "senaryolar", icon: "M4 18c4-1 5-9 8-9s4 5 8 3", orgTypes: ["BELEDIYE"] },
      { href: "/faktorler", label: "emisyon faktörleri", icon: "M4 6h16M6 12h12M9 18h6", orgTypes: ["BELEDIYE"] },
      { href: "/raporlar", label: "raporlar", icon: "M7 3h7l4 4v14H7zM14 3v5h5", orgTypes: ["BELEDIYE"] },
    ],
  },
  {
    group: "yönetim",
    items: [
      { href: "/kurumlar", label: "kurumlar", icon: "M3 21h18M5 21V7l5-4v18m4 0V11l5 3v7", roles: ["SUPER_ADMIN"] },
      { href: "/donem", label: "dönem yönetimi", icon: "M8 3v3m8-3v3M4 8h16M5 5h14a1 1 0 011 1v13a1 1 0 01-1 1H5a1 1 0 01-1-1V6a1 1 0 011-1zM12 13h4", roles: ["SUPER_ADMIN", "IKLIM_MERKEZI", "MUDURLUK_ONAY"] },
      { href: "/kullanicilar", label: "kullanıcılar", icon: "M16 19a4 4 0 00-8 0M12 11a3.5 3.5 0 100-7 3.5 3.5 0 000 7z", roles: ["SUPER_ADMIN", "SISTEM_YONETICISI"] },
      { href: "/denetim", label: "denetim izi", icon: "M12 8v5l3 2M12 21a9 9 0 110-18 9 9 0 010 18z", roles: ["SUPER_ADMIN", "SISTEM_YONETICISI", "IKLIM_MERKEZI"] },
      { href: "/ayarlar", label: "ayarlar", icon: "M12 15a3 3 0 100-6 3 3 0 000 6zM19 12a7 7 0 01-.1 1.2l2 1.6-2 3.4-2.4-1a7 7 0 01-2 1.2L14 21h-4l-.4-2.6a7 7 0 01-2-1.2l-2.5 1-2-3.4 2-1.6A7 7 0 015 12a7 7 0 01.1-1.2l-2-1.6 2-3.4 2.4 1a7 7 0 012-1.2L10 3h4l.4 2.6a7 7 0 012 1.2l2.5-1 2 3.4-2 1.6c.06.4.1.8.1 1.2z", roles: ["SUPER_ADMIN", "IKLIM_MERKEZI"] },
      { href: "/entegrasyon", label: "entegrasyon", icon: "M13 10V3L4 14h7v7l9-11h-7z", roles: ["SUPER_ADMIN", "SISTEM_YONETICISI"] },
      { href: "/sistem", label: "sistem", icon: "M5 8h14M5 8a2 2 0 01-2-2V5a2 2 0 012-2h14a2 2 0 012 2v1a2 2 0 01-2 2M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8M9 12h6", roles: ["SUPER_ADMIN"] },
    ],
  },
];

export function Sidebar({ role, product, orgType }: { role: Role; product: string; orgType: string }) {
  const pathname = usePathname();
  return (
    <aside className="sticky top-0 hidden h-dvh w-[248px] shrink-0 flex-col gap-5 border-r border-leaf-200/50 bg-white/45 px-4 py-5 backdrop-blur-xl lg:flex">
      <Link href="/" className="px-2">
        <Brand sub={product} />
      </Link>

      <nav className="flex flex-1 flex-col gap-4 overflow-y-auto">
        {NAV.map((g) => {
          const items = g.items.filter((i) => (!i.roles || i.roles.includes(role)) && (!i.orgTypes || i.orgTypes.includes(orgType)));
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
        on-premise kurulum —<br />verileriniz kurumunuzda kalır
      </p>
    </aside>
  );
}

/** Dar ekranlar için yatay kaydırmalı gezinme şeridi. */
export function MobileNav({ role, orgType }: { role: Role; orgType: string }) {
  const pathname = usePathname();
  const items = NAV.flatMap((g) => g.items).filter((i) => (!i.roles || i.roles.includes(role)) && (!i.orgTypes || i.orgTypes.includes(orgType)));
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
