"use client";
/* Yetki matrisi — rol × yetenek görsel matris + rol bazında kullanıcı hızlı atama */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ROLE_LABELS, type Role } from "@/lib/constants";
import { YETENEKLER, kategoriAlani } from "@/lib/yetki";

const MATRIS_ROLLER: Role[] = [
  "SUPER_ADMIN", "IKLIM_MERKEZI", "SISTEM_YONETICISI", "MUDURLUK_VERI", "MUDURLUK_ONAY",
  "ENERJI_YONETICISI", "FILO_YONETICISI", "ATIK_UZMANI", "MALI_HIZMETLER", "CBS_UZMANI", "UST_YONETIM",
];
const ASSIGNABLE = MATRIS_ROLLER.filter((r) => r !== "SUPER_ADMIN");

interface UserLite { id: string; name: string; email: string; role: string }

export function YetkiMatrisi({ users, selfId }: { users: UserLite[]; selfId: string }) {
  const router = useRouter();
  const [acikRol, setAcikRol] = useState<Role | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function rolDegistir(id: string, role: string) {
    setBusyId(id);
    const res = await fetch("/api/kullanicilar", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, role }),
    });
    setBusyId(null);
    if (res.ok) router.refresh();
    else alert((await res.json().catch(() => null))?.error ?? "Güncellenemedi");
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[900px] text-[12px]">
        <thead>
          <tr className="border-b border-leaf-200/60 text-left text-[10.5px] uppercase tracking-wider text-ink/45">
            <th className="px-3 py-2.5">rol</th>
            <th className="px-3 py-2.5">kişi</th>
            {YETENEKLER.map((y) => <th key={y.key} className="px-2 py-2.5 text-center">{y.label}</th>)}
            <th className="px-3 py-2.5">veri kategorileri</th>
          </tr>
        </thead>
        <tbody>
          {MATRIS_ROLLER.map((rol) => {
            const rolUsers = users.filter((u) => u.role === rol);
            const acik = acikRol === rol;
            return (
              <RolSatiri
                key={rol} rol={rol} rolUsers={rolUsers} acik={acik}
                onToggle={() => setAcikRol(acik ? null : rol)}
                busyId={busyId} selfId={selfId} onRolDegistir={rolDegistir}
              />
            );
          })}
        </tbody>
      </table>
      <p className="px-3 py-2.5 text-[11px] text-ink/40">
        satıra tıklayın → o roldeki kullanıcıları görün ve hızlıca rol değiştirin · ✓ = yetkili
      </p>
    </div>
  );
}

function RolSatiri({ rol, rolUsers, acik, onToggle, busyId, selfId, onRolDegistir }: {
  rol: Role; rolUsers: UserLite[]; acik: boolean; onToggle: () => void;
  busyId: string | null; selfId: string;
  onRolDegistir: (id: string, role: string) => void;
}) {
  return (
    <>
      <tr onClick={onToggle}
        className={`cursor-pointer border-b border-leaf-100/60 transition hover:bg-leaf-50/60 ${acik ? "bg-leaf-50/80" : ""}`}>
        <td className="px-3 py-2 font-semibold whitespace-nowrap">{ROLE_LABELS[rol] ?? rol}</td>
        <td className="px-3 py-2 text-ink/55 tabular-nums">{rolUsers.length}</td>
        {YETENEKLER.map((y) => (
          <td key={y.key} className="px-2 py-2 text-center">
            {y.roller.includes(rol)
              ? <span className="inline-grid h-5 w-5 place-items-center rounded-full bg-leaf-100 text-[11px] font-bold text-leaf-700">✓</span>
              : <span className="text-ink/15">—</span>}
          </td>
        ))}
        <td className="px-3 py-2 text-ink/55 whitespace-nowrap">{kategoriAlani(rol)}</td>
      </tr>
      {acik && (
        <tr className="border-b border-leaf-100/60 bg-white/60">
          <td colSpan={YETENEKLER.length + 3} className="px-4 py-3">
            {rolUsers.length === 0 ? (
              <p className="text-[12px] text-ink/40">Bu rolde kullanıcı yok.</p>
            ) : (
              <ul className="grid gap-1.5 sm:grid-cols-2 xl:grid-cols-3">
                {rolUsers.map((u) => (
                  <li key={u.id} className="flex items-center justify-between gap-2 rounded-xl border border-leaf-200/50 bg-white/70 px-3 py-2">
                    <span className="min-w-0">
                      <span className="block truncate text-[12.5px] font-medium">{u.name}</span>
                      <span className="block truncate text-[11px] text-ink/45">{u.email}</span>
                    </span>
                    {rol === "SUPER_ADMIN" || u.id === selfId ? (
                      <span className="shrink-0 text-[10.5px] text-ink/30">{u.id === selfId ? "siz" : "korumalı"}</span>
                    ) : (
                      <select
                        value={u.role} disabled={busyId === u.id}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => onRolDegistir(u.id, e.target.value)}
                        className="shrink-0 cursor-pointer rounded-lg border border-leaf-200/60 bg-white/70 px-1.5 py-1 text-[11px] outline-none focus:ring-2 focus:ring-leaf-200"
                      >
                        {ASSIGNABLE.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                      </select>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </td>
        </tr>
      )}
    </>
  );
}
