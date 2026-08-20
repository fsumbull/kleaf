"use client";
/* Kullanıcı yönetimi istemcisi — modal tabanlı parola sıfırlama, aktif/pasif, rol */
import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Field, inputCls, btnPrimary, btnGhost } from "@/components/ui";
import { ROLE_LABELS } from "@/lib/constants";

const ASSIGNABLE = [
  "UST_YONETIM", "IKLIM_MERKEZI", "MUDURLUK_VERI", "MUDURLUK_ONAY",
  "ENERJI_YONETICISI", "FILO_YONETICISI", "ATIK_UZMANI", "CBS_UZMANI",
  "MALI_HIZMETLER", "SISTEM_YONETICISI",
] as const;
const UNIT_SCOPED = new Set<string>(["MUDURLUK_VERI", "MUDURLUK_ONAY"]);

const passwordPolicy = z
  .string()
  .min(10, "En az 10 karakter")
  .max(100)
  .regex(/\p{L}/u, "En az bir harf içermeli")
  .regex(/\d/, "En az bir rakam içermeli");

const schema = z.object({
  name: z.string().min(2, "En az 2 karakter"),
  email: z.string().email("Geçerli bir e-posta girin"),
  password: passwordPolicy,
  role: z.enum(ASSIGNABLE),
  orgId: z.string().min(1, "Kurum seçin"),
  unitId: z.string().optional(),
}).refine((v) => !UNIT_SCOPED.has(v.role) || !!v.unitId, {
  message: "Bu rol için müdürlük seçin", path: ["unitId"],
});
type FormValues = z.infer<typeof schema>;

/* ── ESC ile kapanan modal kabuğu ── */
function ModalShell({ onClose, children, title }: { onClose: () => void; children: ReactNode; title: string }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/30 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="glass-strong w-full max-w-md rounded-2xl p-6" onClick={(e) => e.stopPropagation()}>
        <h3 className="mb-4 text-[15px] font-bold tracking-tight">{title}</h3>
        {children}
      </div>
    </div>
  );
}

export function KullaniciEkleButonu({ orgs, defaultOrgId, units }: {
  orgs: { id: string; name: string }[];
  defaultOrgId: string;
  units: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const { register, handleSubmit, reset, watch, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { role: "MUDURLUK_VERI", orgId: defaultOrgId },
  });
  const selectedRole = watch("role");

  function close() {
    setOpen(false);
    setServerError(null);
    reset({ role: "MUDURLUK_VERI", orgId: defaultOrgId, name: "", email: "", password: "" });
  }

  async function onSubmit(v: FormValues) {
    setServerError(null);
    const res = await fetch("/api/kullanicilar", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...v, unitId: UNIT_SCOPED.has(v.role) ? v.unitId : null }),
    });
    if (res.ok) { close(); router.refresh(); }
    else setServerError((await res.json().catch(() => null))?.error ?? "Kaydedilemedi");
  }

  return (
    <>
      <button type="button" className={btnPrimary} onClick={() => setOpen(true)}>+ yeni kullanıcı</button>
      {open && (
        <ModalShell onClose={close} title="Yeni kullanıcı">
          <form onSubmit={handleSubmit(onSubmit)} className="grid gap-3">
            <Field label="ad soyad" error={errors.name?.message}>
              <input {...register("name")} className={inputCls} placeholder="ör. Ayşe Demir" />
            </Field>
            <Field label="e-posta" error={errors.email?.message}>
              <input type="email" {...register("email")} className={inputCls} placeholder="ornek@kurum.gov.tr" />
            </Field>
            <Field label="geçici parola" error={errors.password?.message}>
              <input type="password" {...register("password")} className={inputCls} placeholder="en az 10 karakter, 1 harf + 1 rakam" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="rol" error={errors.role?.message}>
                <select {...register("role")} className={inputCls}>
                  {ASSIGNABLE.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                </select>
              </Field>
              <Field label="kurum" error={errors.orgId?.message}>
                <select {...register("orgId")} className={inputCls} disabled={orgs.length === 1}>
                  {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
              </Field>
            </div>
            {UNIT_SCOPED.has(selectedRole) && (
              <Field label="müdürlük" error={errors.unitId?.message}>
                <select {...register("unitId")} className={inputCls}>
                  <option value="">seçin…</option>
                  {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              </Field>
            )}
            {serverError && <p className="text-[12px] text-danger">{serverError}</p>}
            <div className="mt-1 flex justify-end gap-2">
              <button type="button" className={btnGhost} onClick={close}>vazgeç</button>
              <button type="submit" className={btnPrimary} disabled={isSubmitting}>
                {isSubmitting ? "kaydediliyor…" : "kullanıcı oluştur"}
              </button>
            </div>
          </form>
        </ModalShell>
      )}
    </>
  );
}

/* ── parola sıfırlama modalı (yönetici → başka kullanıcı) ── */
function ParolaModal({ id, email, onClose }: { id: string; email: string; onClose: () => void }) {
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    const check = passwordPolicy.safeParse(pw);
    if (!check.success) { setErr(check.error.issues[0]?.message ?? "Geçersiz parola"); return; }
    if (pw !== pw2) { setErr("Parolalar eşleşmiyor"); return; }
    setBusy(true);
    const res = await fetch("/api/kullanicilar", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, password: pw }),
    });
    setBusy(false);
    if (res.ok) { setOk(true); setTimeout(onClose, 900); }
    else setErr((await res.json().catch(() => null))?.error ?? "Güncellenemedi");
  }

  return (
    <ModalShell onClose={onClose} title="Parola sıfırla">
      <p className="mb-3 text-[12.5px] text-ink/55"><b>{email}</b> için yeni parola belirleyin.</p>
      <form onSubmit={onSubmit} className="grid gap-3">
        <Field label="yeni parola">
          <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} className={inputCls}
            placeholder="en az 10 karakter, 1 harf + 1 rakam" autoFocus />
        </Field>
        <Field label="yeni parola (tekrar)">
          <input type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} className={inputCls} />
        </Field>
        {err && <p className="text-[12px] text-danger">{err}</p>}
        {ok && <p className="text-[12px] font-medium text-leaf-700">Parola güncellendi ✓</p>}
        <div className="mt-1 flex justify-end gap-2">
          <button type="button" className={btnGhost} onClick={onClose}>vazgeç</button>
          <button type="submit" className={btnPrimary} disabled={busy || ok}>
            {busy ? "kaydediliyor…" : "parolayı güncelle"}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

export function KullaniciSatirAksiyonlari({ id, email, isSelf }: { id: string; email: string; isSelf: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);

  async function onDelete() {
    if (!confirm(`${email} kullanıcısını silmek istediğinize emin misiniz?`)) return;
    setBusy(true);
    const res = await fetch("/api/kullanicilar", {
      method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }),
    });
    setBusy(false);
    if (res.ok) router.refresh();
    else alert((await res.json().catch(() => null))?.error ?? "Silinemedi");
  }

  if (isSelf) return <span className="text-[11px] text-ink/30">siz</span>;
  return (
    <span className="inline-flex gap-1">
      <button type="button" onClick={() => setPwOpen(true)} disabled={busy}
        className="cursor-pointer rounded-lg px-2 py-1 text-[11.5px] text-ink/50 transition hover:bg-leaf-50 hover:text-leaf-800">
        parola sıfırla
      </button>
      <button type="button" onClick={onDelete} disabled={busy}
        className="cursor-pointer rounded-lg px-2 py-1 text-[11.5px] text-danger/60 transition hover:bg-red-50 hover:text-danger">
        sil
      </button>
      {pwOpen && <ParolaModal id={id} email={email} onClose={() => setPwOpen(false)} />}
    </span>
  );
}

/* ── aktif/pasif anahtarı ── */
export function AktifToggle({ id, active, isSelf }: { id: string; active: boolean; isSelf: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  if (isSelf) {
    return <span className="inline-flex items-center rounded-full border border-leaf-200 bg-leaf-100 px-2.5 py-0.5 text-[11px] font-medium text-leaf-700">aktif</span>;
  }

  async function toggle() {
    if (active && !confirm("Kullanıcı pasifleştirilecek ve oturum açamayacak. Devam edilsin mi?")) return;
    setBusy(true);
    const res = await fetch("/api/kullanicilar", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, active: !active }),
    });
    setBusy(false);
    if (res.ok) router.refresh();
    else alert((await res.json().catch(() => null))?.error ?? "Güncellenemedi");
  }

  return (
    <button type="button" onClick={toggle} disabled={busy} title={active ? "pasifleştir" : "aktifleştir"}
      className={`inline-flex cursor-pointer items-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition ${
        active
          ? "border-leaf-200 bg-leaf-100 text-leaf-700 hover:border-red-200 hover:bg-red-50 hover:text-danger"
          : "border-ink/10 bg-ink/5 text-ink/45 hover:border-leaf-200 hover:bg-leaf-50 hover:text-leaf-700"
      }`}>
      {busy ? "…" : active ? "aktif" : "pasif"}
    </button>
  );
}

export function RolSecici({ id, role, disabled }: { id: string; role: string; disabled: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  if (disabled) return <span className="text-[12.5px]">{ROLE_LABELS[role as keyof typeof ROLE_LABELS] ?? role}</span>;

  return (
    <select
      value={role} disabled={busy}
      onChange={async (e) => {
        setBusy(true);
        const res = await fetch("/api/kullanicilar", {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, role: e.target.value }),
        });
        setBusy(false);
        if (res.ok) router.refresh();
        else alert((await res.json().catch(() => null))?.error ?? "Güncellenemedi");
      }}
      className="cursor-pointer rounded-lg border border-leaf-200/60 bg-white/70 px-2 py-1 text-[12px] outline-none transition focus:ring-2 focus:ring-leaf-200"
    >
      {ASSIGNABLE.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
    </select>
  );
}
