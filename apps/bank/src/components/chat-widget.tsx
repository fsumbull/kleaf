"use client";
/* kleaf asistanı — sağ altta açılır sohbet paneli. Tamamen yerel (Ollama) çalışır;
 * işlem araçları kullanıcı onay kartıyla doğrulanır, sunucu rol/kapsam denetimi yapar. */
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

interface Msg { role: "user" | "assistant"; content: string }
interface PendingAction { tool: string; args: Record<string, unknown> }

const ACTION_LABELS: Record<string, string> = {
  veri_taslak_olustur: "Taslak veri kaydı oluşturulacak",
  veri_onayla: "Kayıtlar onaylanıp envantere işlenecek",
};

export function ChatWidget() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs, pending, open]);

  async function post(body: unknown): Promise<{ reply?: string; error?: string; pendingAction?: PendingAction; ok?: boolean }> {
    const res = await fetch("/api/chat", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    return res.json().catch(() => ({ error: "Sunucu hatası" }));
  }

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    setPending(null);
    const next: Msg[] = [...msgs, { role: "user", content: text }];
    setMsgs(next);
    setBusy(true);
    const data = await post({ messages: next.slice(-12) });
    setBusy(false);
    if (data.error) { setMsgs((m) => [...m, { role: "assistant", content: `⚠️ ${data.error}` }]); return; }
    setMsgs((m) => [...m, { role: "assistant", content: data.reply ?? "…" }]);
    if (data.pendingAction) setPending(data.pendingAction);
  }

  async function confirmAction(action: PendingAction) {
    setPending(null);
    setBusy(true);
    const data = await post({ messages: msgs.slice(-12), confirm: action });
    setBusy(false);
    setMsgs((m) => [...m, { role: "assistant", content: data.error ? `⚠️ ${data.error}` : (data.ok ? `✅ ${data.reply}` : `⚠️ ${data.reply}`) }]);
    if (data.ok) router.refresh();
  }

  return (
    <>
      {/* açma düğmesi */}
      <button
        type="button" onClick={() => setOpen((o) => !o)} aria-label="kleaf asistanı"
        className="fixed bottom-5 right-5 z-40 grid h-13 w-13 cursor-pointer place-items-center rounded-full bg-leaf-600 text-white shadow-[0_10px_28px_-8px_rgba(22,163,74,0.7)] transition hover:bg-leaf-700 hover:scale-105"
        style={{ width: 52, height: 52 }}
      >
        {open ? (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
        ) : (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 12a8 8 0 01-8 8H5l-2 2V12a8 8 0 018-8h2a8 8 0 018 8z" /><path d="M9 11h.01M13 11h.01M17 11h.01" />
          </svg>
        )}
      </button>

      {open && (
        <div className="glass-strong fixed bottom-20 right-5 z-40 flex h-[520px] w-[360px] max-w-[calc(100vw-40px)] flex-col overflow-hidden rounded-2xl shadow-2xl">
          <div className="flex items-center justify-between border-b border-leaf-200/50 px-4 py-3">
            <div>
              <p className="text-[13.5px] font-bold tracking-tight">kleaf asistanı</p>
              <p className="text-[10.5px] text-ink/40">yerel yapay zeka — verileriniz kurumunuzda kalır</p>
            </div>
            <span className="rounded-full bg-leaf-100 px-2 py-0.5 text-[10px] font-semibold text-leaf-700">yerel</span>
          </div>

          <div className="flex-1 space-y-2.5 overflow-y-auto px-3.5 py-3">
            {msgs.length === 0 && (
              <div className="space-y-1.5 pt-2">
                <p className="text-[12px] text-ink/45">Örnekler:</p>
                {["2025 toplam emisyonumuz ne kadar?", "Onay bekleyen kayıtları listele", "Belediye Hizmet Binası için haziran elektrik verisi gir"].map((s) => (
                  <button key={s} type="button" onClick={() => setInput(s)}
                    className="block w-full cursor-pointer rounded-xl border border-leaf-200/60 bg-white/60 px-3 py-2 text-left text-[12px] text-ink/70 transition hover:bg-leaf-50">
                    {s}
                  </button>
                ))}
              </div>
            )}
            {msgs.map((m, i) => (
              <div key={i} className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-[12.5px] leading-relaxed ${
                m.role === "user" ? "ml-auto bg-leaf-600 text-white" : "bg-white/80 text-ink border border-leaf-100"
              }`}>
                {m.content}
              </div>
            ))}
            {pending && (
              <div className="rounded-2xl border border-warm/40 bg-amber-50/80 px-3.5 py-3">
                <p className="mb-1 text-[12px] font-semibold text-ink">{ACTION_LABELS[pending.tool] ?? pending.tool}</p>
                <pre className="mb-2.5 max-h-28 overflow-y-auto whitespace-pre-wrap rounded-lg bg-white/70 p-2 text-[11px] text-ink/60">{JSON.stringify(pending.args, null, 1)}</pre>
                <div className="flex gap-2">
                  <button type="button" onClick={() => confirmAction(pending)}
                    className="cursor-pointer rounded-lg bg-leaf-600 px-3 py-1.5 text-[12px] font-medium text-white transition hover:bg-leaf-700">
                    onayla ve uygula
                  </button>
                  <button type="button" onClick={() => { setPending(null); setMsgs((m) => [...m, { role: "assistant", content: "İşlem iptal edildi." }]); }}
                    className="cursor-pointer rounded-lg border border-ink/10 px-3 py-1.5 text-[12px] text-ink/60 transition hover:bg-ink/5">
                    vazgeç
                  </button>
                </div>
              </div>
            )}
            {busy && (
              <div className="flex items-center gap-2 px-1 text-[12px] text-ink/45">
                <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-leaf-300 border-t-leaf-600" />
                düşünüyor…
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          <div className="border-t border-leaf-200/50 p-2.5">
            <div className="flex gap-1.5">
              <input
                value={input} onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
                placeholder="emisyon, veri girişi, onay…"
                className="flex-1 rounded-xl border border-leaf-200/70 bg-white/70 px-3 py-2 text-[12.5px] outline-none transition placeholder:text-ink/30 focus:ring-2 focus:ring-leaf-200"
              />
              <button type="button" onClick={send} disabled={busy || !input.trim()}
                className="cursor-pointer rounded-xl bg-leaf-600 px-3.5 text-white transition hover:bg-leaf-700 disabled:opacity-40">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" /></svg>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
