"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Logo } from "@/components/logo";
import { btnPrimary, inputCls, Field } from "@/components/ui";

const DEMO = [
  { label: "belediye admin", email: "ibb@kleaf.co" },
  { label: "üst yönetim", email: "ust@kleaf.co" },
  { label: "mali hizmetler", email: "mali@kleaf.co" },
  { label: "ulaşım (veri)", email: "ibb-ulasim@kleaf.co" },
  { label: "park bahçe (veri)", email: "ibb-park@kleaf.co" },
  { label: "itfaiye (veri)", email: "ibb-itfaiye@kleaf.co" },
  { label: "sağlık (veri)", email: "ibb-saglik@kleaf.co" },
  { label: "çevre (veri)", email: "ibb-cevre@kleaf.co" },
  { label: "ulaşım (onay)", email: "ibb-ulasim-onay@kleaf.co" },
  { label: "karbon bankası", email: "banka@kleaf.co" },
  { label: "banka analist", email: "analist@kleaf.co" },
  { label: "süper admin", email: "admin@kleaf.co" },
];

export default function GirisPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (res.ok) {
      const data = await res.json().catch(() => null);
      const target = data?.redirect as string | null | undefined;
      // farklı port'a yönlendirme gerekiyorsa tam URL ile yönlen (cookie SameSite=Lax aynı origin gerektirir; port aynı host olduğu için tarayıcı cookie'yi taşır)
      if (target && !target.startsWith(window.location.origin + "/")) {
        window.location.href = target;
        return;
      }
      router.push("/");
      router.refresh();
    } else {
      const data = await res.json().catch(() => null);
      setError(data?.error ?? "Giriş başarısız");
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      {/* marka paneli */}
      <div className="relative hidden overflow-hidden lg:block">
        <div className="absolute inset-0 bg-[linear-gradient(150deg,#0c4a33_0%,#15803c_60%,#16a34a_100%)]" />
        <div className="absolute -right-24 -top-24 h-[420px] w-[420px] rounded-full bg-leaf-400/20 blur-3xl" />
        <div className="absolute -bottom-32 -left-16 h-[380px] w-[380px] rounded-full bg-leaf-300/15 blur-3xl" />
        <svg className="absolute right-[-60px] bottom-[-40px] opacity-[0.13]" width="460" height="460" viewBox="0 0 120 120" fill="none" aria-hidden="true">
          <path d="M60 8 L103 33 V85 L60 110 L17 85 V33 Z" stroke="#fff" strokeWidth="4" strokeLinejoin="round" />
          <path d="M40 82 C40 52 55 38 84 38 C84 68 69 82 40 82 Z" fill="#fff" />
        </svg>

        <div className="relative flex h-full flex-col justify-between p-12">
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7 }}
            className="flex items-center gap-3">
            <Logo size={36} />
            <span className="text-[24px] font-bold tracking-tight text-white">
              kleaf<i className="not-italic text-leaf-300">.</i>
            </span>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.15 }}>
            <p className="text-[11px] lowercase tracking-[0.3em] text-leaf-300">dijital karbon yönetim platformu</p>
            <h1 className="mt-3 max-w-md text-[34px] font-bold leading-[1.15] tracking-tight text-white">
              Karbonu ölçün, azaltın,
              <span className="text-leaf-300"> 2053&apos;e birlikte yürüyelim.</span>
            </h1>
            <p className="mt-4 max-w-md text-[13.5px] leading-relaxed text-white/60">
              ISO 14064-1 ve GHG Protokolü uyumlu sera gazı envanteri, iklim eylem planı takibi
              ve net-sıfır senaryoları — tamamı kurumunuzun kendi sunucusunda.
            </p>
            <div className="mt-6 flex gap-2">
              {["karbonkent kurumsal"].map((p) => (
                <span key={p} className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[11px] lowercase tracking-[0.12em] text-white/80">
                  {p}
                </span>
              ))}
            </div>
          </motion.div>

          <p className="text-[11px] text-white/35">on-premise kurulum — verileriniz kurumunuzda kalır</p>
        </div>
      </div>

      {/* form paneli */}
      <div className="flex items-center justify-center p-6">
        <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.1 }}
          className="glass-strong w-full max-w-[400px] p-8">
          <div className="mb-7 lg:hidden"><Logo size={34} /></div>
          <p className="eyebrow">hoş geldiniz</p>
          <h2 className="mt-1 text-[22px] font-bold tracking-tight text-ink">Panele giriş yapın</h2>

          <form onSubmit={submit} className="mt-6 space-y-4">
            <Field label="e-posta">
              <input
                type="email" required autoComplete="email" value={email} placeholder="ornek@kurum.gov.tr"
                onChange={(e) => setEmail(e.target.value)} className={inputCls}
              />
            </Field>
            <Field label="şifre">
              <input
                type="password" required autoComplete="current-password" value={password} placeholder="••••••••"
                onChange={(e) => setPassword(e.target.value)} className={inputCls}
              />
            </Field>

            {error && (
              <p className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-[12.5px] text-danger">{error}</p>
            )}

            <button type="submit" disabled={busy} className={`${btnPrimary} w-full`}>
              {busy ? "giriş yapılıyor…" : "giriş yap"}
            </button>
          </form>

          <div className="mt-7 rounded-2xl border border-leaf-200/70 bg-leaf-50/70 p-4">
            <p className="eyebrow mb-2">demo hesapları · şifre: kleaf2026</p>
            <div className="space-y-1">
              {DEMO.map((d) => (
                <button
                  key={d.email} type="button"
                  onClick={() => { setEmail(d.email); setPassword("kleaf2026"); }}
                  className="flex w-full cursor-pointer items-center justify-between rounded-lg px-2 py-1.5 text-left transition hover:bg-white/70"
                >
                  <span className="text-[12px] text-ink/70">{d.label}</span>
                  <span className="text-[11.5px] font-medium text-leaf-700">{d.email}</span>
                </button>
              ))}
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
