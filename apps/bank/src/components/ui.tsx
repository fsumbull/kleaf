/* kleaf UI kiti — buzlu cam kartlar, rozetler, tablolar, boş durumlar */
import type { ReactNode } from "react";
import Link from "next/link";

export function PageHeader({ eyebrow, title, desc, actions }: {
  eyebrow: string; title: string; desc?: string; actions?: ReactNode;
}) {
  return (
    <div className="rise mb-5 flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-ink">{title}</h1>
        {desc && <p className="mt-1 max-w-2xl text-sm text-ink/60">{desc}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ children, className = "", pad = true }: {
  children: ReactNode; className?: string; pad?: boolean;
}) {
  return <div className={`glass ${pad ? "p-5" : ""} ${className}`}>{children}</div>;
}

export function CardTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 className="text-[13px] font-medium lowercase tracking-[0.08em] text-ink/70">{children}</h2>
      {right}
    </div>
  );
}

export function KpiCard({ label, value, unit, delta, deltaGoodWhenNegative = true, hint, tone = "leaf", href }: {
  label: string; value: string; unit?: string; delta?: number | null;
  deltaGoodWhenNegative?: boolean; hint?: string; tone?: "leaf" | "warm" | "danger"; href?: string;
}) {
  const toneMap = { leaf: "text-leaf-600", warm: "text-warm", danger: "text-danger" };
  let deltaEl: ReactNode = null;
  if (delta !== undefined && delta !== null) {
    const good = deltaGoodWhenNegative ? delta <= 0 : delta >= 0;
    deltaEl = (
      <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${good ? "bg-leaf-100 text-leaf-700" : "bg-amber-100 text-warm"}`}>
        {delta > 0 ? "+" : ""}{delta.toLocaleString("tr-TR", { maximumFractionDigits: 1 })}%
      </span>
    );
  }
  const inner = (
    <>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[12px] lowercase tracking-[0.1em] text-ink/55">{label}</p>
        {deltaEl}
      </div>
      <p className={`mt-2 text-[28px] font-bold leading-none tracking-tight ${toneMap[tone]}`}>
        {value}
        {unit && <span className="ml-1.5 text-[13px] font-medium text-ink/45">{unit}</span>}
      </p>
      {hint && <p className="mt-2 text-[11.5px] text-ink/45">{hint}</p>}
    </>
  );
  if (href) {
    return (
      <Link href={href} className="glass block p-5 transition hover:-translate-y-0.5 hover:shadow-lg" title="modüle git">
        {inner}
      </Link>
    );
  }
  return <div className="glass p-5">{inner}</div>;
}

export function Badge({ children, tone = "leaf" }: {
  children: ReactNode; tone?: "leaf" | "warm" | "gray" | "danger";
}) {
  const map = {
    leaf: "bg-leaf-100 text-leaf-700 border-leaf-200",
    warm: "bg-amber-50 text-warm border-amber-200",
    gray: "bg-ink/5 text-ink/60 border-ink/10",
    danger: "bg-red-50 text-danger border-red-200",
  };
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium lowercase ${map[tone]}`}>
      {children}
    </span>
  );
}

export function StatusPill({ status }: { status: string }) {
  if (status === "ONAYLI") return <Badge tone="leaf">onaylı</Badge>;
  if (status === "TASLAK") return <Badge tone="warm">taslak</Badge>;
  if (status === "MUDURLUK_ONAYLI") return <Badge tone="warm">müdürlük onaylı</Badge>;
  if (status === "TAMAMLANDI") return <Badge tone="leaf">tamamlandı</Badge>;
  if (status === "DEVAM_EDIYOR") return <Badge tone="warm">devam ediyor</Badge>;
  if (status === "PLANLANDI") return <Badge tone="gray">planlandı</Badge>;
  return <Badge tone="gray">{status.toLowerCase()}</Badge>;
}

export function Table({ head, children, dense }: {
  head: ReactNode; children: ReactNode; dense?: boolean;
}) {
  return (
    <div className="overflow-x-auto">
      <table className={`w-full text-left ${dense ? "text-[12.5px]" : "text-[13px]"}`}>
        <thead>
          <tr className="border-b border-leaf-200/60 text-[11px] lowercase tracking-[0.12em] text-ink/45 [&>th]:py-2.5 [&>th]:pr-4 [&>th]:font-medium">
            {head}
          </tr>
        </thead>
        <tbody className="[&>tr]:border-b [&>tr]:border-leaf-100/70 [&>tr:hover]:bg-leaf-50/50 [&>tr>td]:py-2.5 [&>tr>td]:pr-4">
          {children}
        </tbody>
      </table>
    </div>
  );
}

export function EmptyState({ title, desc, action }: { title: string; desc?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center py-14 text-center">
      <svg width="52" height="52" viewBox="0 0 120 120" fill="none" aria-hidden="true" className="opacity-40">
        <path d="M60 8 L103 33 V85 L60 110 L17 85 V33 Z" stroke="#2563EB" strokeWidth="5" strokeLinejoin="round" fill="none" strokeDasharray="6 8" />
        <path d="M40 82 C40 52 55 38 84 38 C84 68 69 82 40 82 Z" fill="#bfdbfe" />
      </svg>
      <p className="mt-4 text-[15px] font-medium text-ink/70">{title}</p>
      {desc && <p className="mt-1 max-w-sm text-[12.5px] text-ink/45">{desc}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`skeleton ${className}`} />;
}

/* form alanları */
export function Field({ label, children, error }: { label: string; children: ReactNode; error?: string }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[11.5px] lowercase tracking-[0.1em] text-ink/55">{label}</span>
      {children}
      {error && <span className="mt-1 block text-[11.5px] text-danger">{error}</span>}
    </label>
  );
}

export const inputCls =
  "w-full rounded-xl border border-leaf-200/80 bg-white/80 px-3.5 py-2.5 text-[13.5px] text-ink outline-none transition placeholder:text-ink/30 focus:border-leaf-500 focus:ring-2 focus:ring-leaf-200/60";

export const btnPrimary =
  "inline-flex cursor-pointer items-center justify-center gap-2 rounded-full bg-leaf-600 px-5 py-2.5 text-[13px] font-medium text-white shadow-[0_8px_20px_-8px_rgba(22,163,74,0.55)] transition hover:bg-leaf-700 focus-visible:ring-2 focus-visible:ring-leaf-300 disabled:cursor-not-allowed disabled:opacity-50";

export const btnGhost =
  "inline-flex cursor-pointer items-center justify-center gap-2 rounded-full border border-leaf-200 bg-white/70 px-4 py-2 text-[12.5px] font-medium text-leaf-700 transition hover:border-leaf-400 hover:bg-leaf-50 focus-visible:ring-2 focus-visible:ring-leaf-200 disabled:cursor-not-allowed disabled:opacity-50";

export const btnDanger =
  "inline-flex cursor-pointer items-center justify-center gap-2 rounded-full border border-red-200 bg-white/70 px-4 py-2 text-[12.5px] font-medium text-danger transition hover:bg-red-50 disabled:opacity-50";
