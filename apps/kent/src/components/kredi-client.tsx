"use client";
/* Karbon kredisi istemcisi — havuz vitrini, talep, transfer/iptal, mahsup (belediye) */
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardTitle, Badge, Field, inputCls, btnPrimary, btnGhost, EmptyState } from "@/components/ui";
import { CREDIT_STANDARD_LABELS, CREDIT_STATUS_LABELS, type CreditStandard, type CreditStatus } from "@/lib/constants";
import { fmt1 } from "@/lib/format";

export interface VitrinHavuzDto {
  id: string; projectName: string; standard: string; vintageYear: number;
  availableTCO2e: number; priceTRYPerTon: number; bankOrg: string;
}
export interface KrediIslemDto {
  id: string; status: string; amountTCO2e: number; priceTRYPerTon: number;
  requestNote: string | null; decisionNote: string | null; createdAt: string;
  pool: { projectName: string; standard: string; vintageYear: number };
  bankOrg: string; mahsupEdilen: number;
}

const statusTone = (s: string): "leaf" | "warm" | "gray" | "danger" =>
  s === "TRANSFER" ? "leaf" : s === "TALEP" ? "warm" : s === "BANKA_ONAY" ? "leaf" : s === "RED" ? "danger" : "gray";

/* ── talep modalı ── */
function TalepModal({ havuz, onClose }: { havuz: VitrinHavuzDto; onClose: () => void }) {
  const router = useRouter();
  const [miktar, setMiktar] = useState("");
  const [not, setNot] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  const m = Number(miktar);
  const tutar = Number.isFinite(m) && m > 0 ? m * havuz.priceTRYPerTon : 0;

  async function gonder() {
    if (!Number.isFinite(m) || m <= 0) { setErr("Pozitif bir miktar girin"); return; }
    if (m > havuz.availableTCO2e) { setErr(`Havuzda ${fmt1(havuz.availableTCO2e)} tCO₂e kaldı`); return; }
    setBusy(true); setErr(null);
    const res = await fetch("/api/kredi", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ poolId: havuz.id, amountTCO2e: m, ...(not.trim() ? { requestNote: not.trim() } : {}) }),
    });
    setBusy(false);
    if (res.ok) { onClose(); router.refresh(); }
    else setErr((await res.json().catch(() => null))?.error ?? "Talep oluşturulamadı");
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/30 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="glass-strong w-full max-w-md rounded-2xl p-6" onClick={(e) => e.stopPropagation()}>
        <h3 className="mb-1 text-[15px] font-bold tracking-tight">Kredi talebi</h3>
        <p className="mb-4 text-[12px] text-ink/50">
          {havuz.projectName} · {CREDIT_STANDARD_LABELS[havuz.standard as CreditStandard] ?? havuz.standard} · {havuz.vintageYear} · {havuz.bankOrg}
        </p>
        <div className="grid gap-3">
          <Field label={`miktar (tCO₂e) — havuzda ${fmt1(havuz.availableTCO2e)} t var`}>
            <input type="number" step="any" min="0" value={miktar} onChange={(e) => setMiktar(e.target.value)} className={inputCls} autoFocus />
          </Field>
          <Field label="talep notu (ops.)">
            <input value={not} onChange={(e) => setNot(e.target.value)} maxLength={300} className={inputCls} placeholder="ör. 2026 net sıfır ara hedefi için" />
          </Field>
          <div className="rounded-xl bg-leaf-50/60 px-4 py-3 text-[12.5px] ring-1 ring-leaf-200/50">
            tahmini tutar: <strong>{fmt1(tutar)} ₺</strong> <span className="text-ink/40">({fmt1(havuz.priceTRYPerTon)} ₺/t — fiyat talepte sabitlenir)</span>
          </div>
          {err && <p className="text-[12px] text-danger">{err}</p>}
          <div className="mt-1 flex justify-end gap-2">
            <button type="button" className={btnGhost} onClick={onClose}>vazgeç</button>
            <button type="button" className={btnPrimary} disabled={busy} onClick={gonder}>{busy ? "gönderiliyor…" : "talep oluştur"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── mahsup modalı ── */
function MahsupModal({ islem, year, onClose }: { islem: KrediIslemDto; year: number; onClose: () => void }) {
  const router = useRouter();
  const kalan = islem.amountTCO2e - islem.mahsupEdilen;
  const [miktar, setMiktar] = useState(String(Math.round(kalan * 10) / 10));
  const [yil, setYil] = useState(String(year));
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  async function gonder() {
    const m = Number(miktar), y = Number(yil);
    if (!Number.isFinite(m) || m <= 0) { setErr("Pozitif bir miktar girin"); return; }
    if (!Number.isInteger(y) || y < 2000 || y > 2100) { setErr("Geçerli bir yıl girin"); return; }
    setBusy(true); setErr(null);
    const res = await fetch("/api/kredi/mahsup", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transactionId: islem.id, year: y, amountTCO2e: m }),
    });
    setBusy(false);
    if (res.ok) { onClose(); router.refresh(); }
    else setErr((await res.json().catch(() => null))?.error ?? "Mahsup yapılamadı");
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/30 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="glass-strong w-full max-w-md rounded-2xl p-6" onClick={(e) => e.stopPropagation()}>
        <h3 className="mb-1 text-[15px] font-bold tracking-tight">Krediyi mahsup et</h3>
        <p className="mb-4 text-[12px] text-ink/50">
          {islem.pool.projectName} · kalan {fmt1(kalan)} tCO₂e — mahsup edilen kredi kalıcı olarak emekliye ayrılır, geri alınamaz.
        </p>
        <div className="grid gap-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="miktar (tCO₂e)">
              <input type="number" step="any" min="0" value={miktar} onChange={(e) => setMiktar(e.target.value)} className={inputCls} autoFocus />
            </Field>
            <Field label="envanter yılı">
              <input type="number" value={yil} onChange={(e) => setYil(e.target.value)} className={inputCls} />
            </Field>
          </div>
          {err && <p className="text-[12px] text-danger">{err}</p>}
          <div className="mt-1 flex justify-end gap-2">
            <button type="button" className={btnGhost} onClick={onClose}>vazgeç</button>
            <button type="button" className={btnPrimary} disabled={busy} onClick={gonder}>{busy ? "işleniyor…" : "mahsup et"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── işlem eylemleri (transfer onayı / iptal) ── */
function IslemEylem({ islem, year }: { islem: KrediIslemDto; year: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [mahsupAcik, setMahsupAcik] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function patch(op: "TRANSFER" | "IPTAL") {
    const mesaj = op === "TRANSFER"
      ? `${fmt1(islem.amountTCO2e)} tCO₂e kredi ${fmt1(islem.amountTCO2e * islem.priceTRYPerTon)} ₺ karşılığında cüzdanınıza aktarılacak. Onaylıyor musunuz?`
      : "Talep iptal edilecek. Devam edilsin mi?";
    if (!confirm(mesaj)) return;
    setBusy(true); setErr(null);
    const res = await fetch("/api/kredi", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: islem.id, islem: op }),
    });
    setBusy(false);
    if (res.ok) router.refresh();
    else setErr((await res.json().catch(() => null))?.error ?? "İşlem başarısız");
  }

  const kalanMahsup = islem.amountTCO2e - islem.mahsupEdilen;
  return (
    <span className="inline-flex flex-wrap items-center justify-end gap-2">
      {islem.status === "BANKA_ONAY" && (
        <button type="button" disabled={busy} onClick={() => patch("TRANSFER")}
          className="cursor-pointer rounded-full border border-leaf-200 bg-leaf-100 px-2.5 py-0.5 text-[11px] font-medium text-leaf-700 transition hover:bg-leaf-200">
          {busy ? "…" : "transferi tamamla"}
        </button>
      )}
      {(islem.status === "TALEP" || islem.status === "BANKA_ONAY") && (
        <button type="button" disabled={busy} onClick={() => patch("IPTAL")}
          className="cursor-pointer rounded-full border border-red-200 bg-red-50 px-2.5 py-0.5 text-[11px] font-medium text-danger transition hover:bg-red-100">
          iptal
        </button>
      )}
      {islem.status === "TRANSFER" && kalanMahsup > 1e-9 && (
        <button type="button" onClick={() => setMahsupAcik(true)}
          className="cursor-pointer rounded-full border border-leaf-200 bg-leaf-100 px-2.5 py-0.5 text-[11px] font-medium text-leaf-700 transition hover:bg-leaf-200">
          mahsup et
        </button>
      )}
      {err && <span className="text-[11px] text-danger">{err}</span>}
      {mahsupAcik && <MahsupModal islem={islem} year={year} onClose={() => setMahsupAcik(false)} />}
    </span>
  );
}

/* ── ana panel ── */
export function KrediPaneli({ havuzlar, islemler, canRequest, year }: {
  havuzlar: VitrinHavuzDto[]; islemler: KrediIslemDto[]; canRequest: boolean; year: number;
}) {
  const [talep, setTalep] = useState<VitrinHavuzDto | null>(null);

  return (
    <div className="grid gap-5">
      <Card className="rise-1">
        <CardTitle right={<span className="text-[11.5px] text-ink/40">{havuzlar.length} havuz vitrinde</span>}>kredi havuzu vitrini</CardTitle>
        {havuzlar.length === 0 ? (
          <EmptyState title="Vitrinde havuz yok" desc="Karbon bankası yeni havuz açtığında burada listelenir." />
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {havuzlar.map((h) => (
              <div key={h.id} className="flex flex-col rounded-xl border border-leaf-200/50 bg-white/50 p-4">
                <div className="mb-1 flex items-start justify-between gap-2">
                  <p className="text-[13px] font-semibold leading-tight">{h.projectName}</p>
                  <Badge tone="gray">{CREDIT_STANDARD_LABELS[h.standard as CreditStandard] ?? h.standard}</Badge>
                </div>
                <p className="text-[11.5px] text-ink/45">{h.bankOrg} · vintage {h.vintageYear}</p>
                <div className="mt-3 flex items-end justify-between">
                  <div>
                    <p className="text-[11px] text-ink/40">satışa açık</p>
                    <p className="text-[15px] font-bold">{fmt1(h.availableTCO2e)} <span className="text-[11px] font-normal text-ink/50">tCO₂e</span></p>
                  </div>
                  <div className="text-right">
                    <p className="text-[11px] text-ink/40">birim fiyat</p>
                    <p className="text-[15px] font-bold">{fmt1(h.priceTRYPerTon)} <span className="text-[11px] font-normal text-ink/50">₺/t</span></p>
                  </div>
                </div>
                {canRequest && (
                  <button type="button" onClick={() => setTalep(h)} className={`${btnPrimary} mt-3 w-full justify-center`}>
                    talep oluştur
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card pad={false} className="rise-2">
        <div className="px-5 pt-4"><CardTitle>işlemlerim</CardTitle></div>
        {islemler.length === 0 ? (
          <div className="px-5 pb-5"><EmptyState title="Henüz kredi işlemi yok" desc="Vitrinden bir havuz seçip talep oluşturun." /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className="text-left text-[10.5px] uppercase tracking-wider text-ink/40">
                  <th className="px-5 py-2">tarih</th><th className="px-3 py-2">havuz</th>
                  <th className="px-3 py-2">banka</th><th className="px-3 py-2 text-right">miktar</th>
                  <th className="px-3 py-2 text-right">tutar</th><th className="px-3 py-2 text-right">mahsup</th>
                  <th className="px-3 py-2">durum</th><th className="px-3 py-2 text-right">eylem</th>
                </tr>
              </thead>
              <tbody>
                {islemler.map((t) => (
                  <tr key={t.id} className="border-t border-leaf-200/30">
                    <td className="px-5 py-2.5 text-ink/50">{new Date(t.createdAt).toLocaleDateString("tr-TR")}</td>
                    <td className="px-3 py-2.5 font-medium">{t.pool.projectName}</td>
                    <td className="px-3 py-2.5 text-ink/60">{t.bankOrg}</td>
                    <td className="px-3 py-2.5 text-right">{fmt1(t.amountTCO2e)} t</td>
                    <td className="px-3 py-2.5 text-right">{fmt1(t.amountTCO2e * t.priceTRYPerTon)} ₺</td>
                    <td className="px-3 py-2.5 text-right text-ink/60">{t.mahsupEdilen > 0 ? `${fmt1(t.mahsupEdilen)} t` : "—"}</td>
                    <td className="px-3 py-2.5">
                      <Badge tone={statusTone(t.status)}>{CREDIT_STATUS_LABELS[t.status as CreditStatus] ?? t.status}</Badge>
                      {t.decisionNote && <span className="ml-1.5 text-[11px] text-ink/40">{t.decisionNote}</span>}
                    </td>
                    <td className="px-3 py-2.5 text-right">{canRequest ? <IslemEylem islem={t} year={year} /> : null}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {talep && <TalepModal havuz={talep} onClose={() => setTalep(null)} />}
    </div>
  );
}
