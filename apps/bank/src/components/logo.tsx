/* kleaf altıgen+yaprak logosu — tanıtım sitesiyle aynı marka dili */
export function Logo({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <defs>
        <linearGradient id="kleaf-lg" x1="30" y1="90" x2="90" y2="30" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#2563EB" />
          <stop offset="1" stopColor="#60A5FA" />
        </linearGradient>
      </defs>
      <path d="M60 8 L103 33 V85 L60 110 L17 85 V33 Z" stroke="#0C2A4A" strokeWidth="7" strokeLinejoin="round" fill="rgba(255,255,255,.75)" />
      <path d="M40 82 C40 52 55 38 84 38 C84 68 69 82 40 82 Z" fill="url(#kleaf-lg)" />
      <path d="M45 77 C55 62 64 53 78 44" stroke="#FFFFFF" strokeWidth="4" strokeLinecap="round" fill="none" />
    </svg>
  );
}

export function Brand({ size = 30, sub }: { size?: number; sub?: string }) {
  return (
    <span className="flex items-center gap-2.5">
      <Logo size={size} />
      <span className="leading-none">
        <span className="block text-[19px] font-bold tracking-tight text-ink">
          kleaf<i className="not-italic text-leaf-500">.</i>
        </span>
        {sub && <span className="mt-0.5 block text-[10px] tracking-[0.18em] text-leaf-700/70">{sub}</span>}
      </span>
    </span>
  );
}
