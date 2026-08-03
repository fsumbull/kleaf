import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiSession } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { CATEGORIES, CATEGORY_CODES, categoryMeta, ROLE_LABELS, type CategoryCode, type Role } from "@/lib/constants";
import { VERI_GIRIS_ROLLER, MERKEZ_ONAY_ROLLER, MUDURLUK_ONAY_ROLLER, kategoriYetkisi, birimKisitli } from "@/lib/yetki";
import { approveActivity } from "@/lib/veri";
import { donemKilitli, DONEM_KILIT_MESAJI } from "@/lib/donem";
import type { Session } from "@/lib/session";

/* ── kleaf asistanı — tamamen yerel Ollama; araç çağrıları sunucuda rol/kapsam denetiminden geçer ── */

const OLLAMA_URL = process.env.OLLAMA_URL ?? "http://localhost:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? "qwen2.5:7b-instruct";

const SYSTEM_PROMPT = `Sen "kleaf asistanı"sın — belediye ve kurumlar için sera gazı (karbon) envanteri platformunun yerleşik yardımcısısın.
KESIN KURALLAR:
- SADECE kleaf platformu konularında yanıt ver: emisyon envanteri, veri girişi, tesisler, onay akışı, raporlar, kategoriler, kapsamlar (Scope 1/2/3).
- Konu dışı istekleri (genel sohbet, kod yazma, dünya haberleri vb.) kibarca reddet: "Yalnızca kleaf platformuyla ilgili yardımcı olabilirim."
- Veri sorgulamak veya işlem yapmak için SADECE tanımlı araçları kullan. Araç sonucu dışında veri uydurma.
- Yanıtlar Türkçe, kısa ve net olsun. Sayıları binlik ayraçla yaz.
- Kullanıcının rolü sınırlıysa yapamayacağı işlemi araç zaten reddeder; sonucu olduğu gibi aktar.
Kategori kodları: ${CATEGORIES.map((c) => `${c.code}(${c.label}, ${c.unit}, kapsam ${c.scope})`).join(", ")}.`;

/* ── araç tanımları (Ollama tool şeması) ── */
const TOOLS = [
  {
    type: "function",
    function: {
      name: "emisyon_ozeti",
      description: "Kurumun onaylı emisyon envanteri özeti: toplam ve kapsam bazında tCO2e, kategori kırılımı. year verilmezse tüm yıllar.",
      parameters: { type: "object", properties: { year: { type: "number", description: "yıl, ör. 2025" } }, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "tesis_listesi",
      description: "Kurumun tesislerini listeler (id, ad).",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "veri_listesi",
      description: "Faaliyet verisi kayıtlarını listeler (id, tesis, dönem, kategori, miktar, durum). Onay bekleyenler için status=TASLAK kullan.",
      parameters: {
        type: "object",
        properties: {
          year: { type: "number" }, month: { type: "number" },
          category: { type: "string", enum: [...CATEGORY_CODES] },
          status: { type: "string", enum: ["TASLAK", "MUDURLUK_ONAYLI", "ONAYLI"] },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "veri_taslak_olustur",
      description: "Yeni faaliyet verisi TASLAK kaydı oluşturur. Tesis adını tesis_listesi ile bulup facilityId ver. Kullanıcı onayı gerektirir.",
      parameters: {
        type: "object",
        properties: {
          facilityId: { type: "string" },
          category: { type: "string", enum: [...CATEGORY_CODES] },
          year: { type: "number" }, month: { type: "number" },
          amount: { type: "number" },
        },
        required: ["facilityId", "category", "year", "month", "amount"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "veri_onayla",
      description: "TASLAK kayıtları onaylar (id listesi). veri_listesi ile id'leri bul. Kullanıcı onayı gerektirir.",
      parameters: {
        type: "object",
        properties: { ids: { type: "array", items: { type: "string" } } },
        required: ["ids"],
      },
    },
  },
];

/** İşlem araçları — otomatik çalıştırılmaz, kullanıcı onay kartıyla doğrular */
const ACTION_TOOLS = new Set(["veri_taslak_olustur", "veri_onayla"]);

async function resolveOrgId(session: Session): Promise<string | null> {
  if (session.role !== "SUPER_ADMIN") return session.orgId;
  const jar = await cookies();
  const pick = jar.get("kleaf_org")?.value;
  if (pick) {
    const ok = await prisma.organization.findUnique({ where: { id: pick }, select: { id: true } });
    if (ok) return ok.id;
  }
  const first = await prisma.organization.findFirst({ select: { id: true }, orderBy: { name: "asc" } });
  return first?.id ?? null;
}

/* ── sorgu araçları (salt okuma, org/birim kapsamlı) ── */
async function runQueryTool(name: string, args: Record<string, unknown>, session: Session, orgId: string): Promise<unknown> {
  const unitFilter = birimKisitli(session.role) && session.unitId ? { unitId: session.unitId } : {};
  switch (name) {
    case "emisyon_ozeti": {
      const year = typeof args.year === "number" ? args.year : undefined;
      const recs = await prisma.emissionRecord.findMany({
        where: {
          activityData: {
            ...(year ? { year } : {}),
            status: "ONAYLI",
            facility: { orgId, ...unitFilter },
          },
        },
        select: { scope: true, tCO2e: true, activityData: { select: { category: true } } },
      });
      const kapsam: Record<number, number> = { 1: 0, 2: 0, 3: 0 };
      const kategori: Record<string, number> = {};
      let toplam = 0;
      for (const r of recs) {
        kapsam[r.scope] = (kapsam[r.scope] ?? 0) + r.tCO2e;
        kategori[r.activityData.category] = (kategori[r.activityData.category] ?? 0) + r.tCO2e;
        toplam += r.tCO2e;
      }
      return { yil: year ?? "tümü", toplam_tCO2e: Math.round(toplam * 100) / 100, kapsam, kategori, kayit_sayisi: recs.length };
    }
    case "tesis_listesi": {
      return prisma.facility.findMany({
        where: { orgId, ...unitFilter },
        select: { id: true, name: true, type: true },
        orderBy: { name: "asc" },
      });
    }
    case "veri_listesi": {
      const rows = await prisma.activityData.findMany({
        where: {
          facility: { orgId, ...unitFilter },
          ...(typeof args.year === "number" ? { year: args.year } : {}),
          ...(typeof args.month === "number" ? { month: args.month } : {}),
          ...(typeof args.category === "string" ? { category: args.category } : {}),
          ...(typeof args.status === "string" ? { status: args.status } : {}),
        },
        select: {
          id: true, year: true, month: true, category: true, amount: true, unit: true, status: true,
          facility: { select: { name: true } },
        },
        orderBy: [{ year: "desc" }, { month: "desc" }],
        take: 30,
      });
      return rows.map((r) => ({
        id: r.id, tesis: r.facility.name, donem: `${r.year}-${String(r.month).padStart(2, "0")}`,
        kategori: r.category, miktar: r.amount, birim: r.unit, durum: r.status,
      }));
    }
    default:
      return { error: "Bilinmeyen araç" };
  }
}

/* ── işlem araçları (kullanıcı onayından sonra) — mevcut API kurallarının aynısı ── */
const taslakSchema = z.object({
  facilityId: z.string().min(1),
  category: z.enum(CATEGORY_CODES),
  year: z.number().int().min(2000).max(2100),
  month: z.number().int().min(1).max(12),
  amount: z.number().min(0),
});

async function runActionTool(name: string, rawArgs: unknown, session: Session, orgId: string): Promise<{ ok: boolean; mesaj: string }> {
  if (name === "veri_taslak_olustur") {
    if (!VERI_GIRIS_ROLLER.includes(session.role)) return { ok: false, mesaj: "Rolünüzün veri giriş yetkisi yok." };
    const parsed = taslakSchema.safeParse(rawArgs);
    if (!parsed.success) return { ok: false, mesaj: parsed.error.issues[0]?.message ?? "Geçersiz parametre" };
    const d = parsed.data;
    if (!kategoriYetkisi(session.role, d.category)) return { ok: false, mesaj: "Bu kategori için yetkiniz yok." };
    const facility = await prisma.facility.findUnique({ where: { id: d.facilityId }, select: { orgId: true, unitId: true, name: true } });
    if (!facility || facility.orgId !== orgId) return { ok: false, mesaj: "Tesis bulunamadı." };
    if (birimKisitli(session.role) && facility.unitId !== session.unitId) return { ok: false, mesaj: "Tesis müdürlüğünüzün kapsamında değil." };
    if (await donemKilitli(orgId, d.year, d.month)) return { ok: false, mesaj: DONEM_KILIT_MESAJI };
    const meta = categoryMeta(d.category as CategoryCode);
    try {
      const created = await prisma.activityData.create({
        data: {
          facilityId: d.facilityId, vehicleKey: "", year: d.year, month: d.month,
          category: d.category, amount: d.amount, unit: meta.unit, status: "TASLAK", createdById: session.sub,
        },
      });
      await audit(session.sub, "CHAT_VERI_EKLE", "ActivityData", created.id, `${d.category} ${d.year}-${d.month} (asistan)`, session.email);
      return { ok: true, mesaj: `Taslak oluşturuldu: ${facility.name} · ${d.category} · ${d.year}-${String(d.month).padStart(2, "0")} · ${d.amount} ${meta.unit}` };
    } catch (e: unknown) {
      if (typeof e === "object" && e && "code" in e && (e as { code: string }).code === "P2002")
        return { ok: false, mesaj: "Bu tesis + dönem + kategori için zaten kayıt var." };
      throw e;
    }
  }
  if (name === "veri_onayla") {
    const merkezOnay = MERKEZ_ONAY_ROLLER.includes(session.role);
    const mudurlukOnay = MUDURLUK_ONAY_ROLLER.includes(session.role);
    if (!merkezOnay && !mudurlukOnay)
      return { ok: false, mesaj: `Onay yetkisi yoktur (rolünüz: ${ROLE_LABELS[session.role as Role] ?? session.role}).` };
    const ids = z.array(z.string().min(1)).min(1).max(50).safeParse((rawArgs as { ids?: unknown })?.ids);
    if (!ids.success) return { ok: false, mesaj: "Geçerli kayıt id listesi verin (en fazla 50)." };
    const acts = await prisma.activityData.findMany({
      where: {
        id: { in: ids.data },
        status: "TASLAK",
        facility: {
          orgId,
          ...(mudurlukOnay && session.unitId ? { unitId: session.unitId } : {}),
        },
      },
      select: { id: true, facility: { select: { orgId: true } } },
    });
    if (acts.length === 0) return { ok: false, mesaj: "Onaylanacak taslak kayıt bulunamadı." };
    let onaylanan = 0;
    for (const a of acts) {
      try {
        if (merkezOnay) {
          await approveActivity(a.id, a.facility.orgId);
        } else {
          await prisma.activityData.update({ where: { id: a.id }, data: { status: "MUDURLUK_ONAYLI" } });
        }
        onaylanan++;
      } catch {
        /* tekil hata atla */
      }
    }
    await audit(
      session.sub,
      "CHAT_VERI_ONAY",
      "ActivityData",
      null,
      `${onaylanan} kayıt asistan üzerinden ${merkezOnay ? "nihai" : "müdürlük"} onaya alındı`,
      session.email
    );
    return {
      ok: true,
      mesaj: merkezOnay
        ? `${onaylanan} kayıt onaylandı ve envantere işlendi.`
        : `${onaylanan} kayıt müdürlük onayına alındı.`,
    };
  }
  return { ok: false, mesaj: "Bilinmeyen işlem." };
}

/* ── Ollama sohbet döngüsü ── */
interface ChatMsg { role: string; content: string; tool_calls?: { function: { name: string; arguments: Record<string, unknown> } }[] }

async function ollamaChat(messages: ChatMsg[]): Promise<ChatMsg> {
  const res = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: OLLAMA_MODEL, messages, tools: TOOLS, stream: false }),
  });
  if (!res.ok) throw new Error(`Ollama yanıt vermedi (${res.status})`);
  const data = await res.json();
  return data.message as ChatMsg;
}

const bodySchema = z.object({
  messages: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(4000) })).min(1).max(30),
  confirm: z.object({ tool: z.string(), args: z.record(z.string(), z.unknown()) }).optional(),
});

export async function POST(req: Request) {
  const session = await apiSession();
  if (!session) return NextResponse.json({ error: "Oturum gerekli" }, { status: 401 });
  const orgId = await resolveOrgId(session);
  if (!orgId) return NextResponse.json({ error: "Kurum bulunamadı" }, { status: 400 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Geçersiz istek" }, { status: 400 });

  // kullanıcı onay kartından gelen işlem — LLM'e gitmeden sunucuda doğrulanıp çalıştırılır
  if (parsed.data.confirm) {
    const { tool, args } = parsed.data.confirm;
    if (!ACTION_TOOLS.has(tool)) return NextResponse.json({ error: "Geçersiz işlem" }, { status: 400 });
    const result = await runActionTool(tool, args, session, orgId);
    return NextResponse.json({ reply: result.mesaj, ok: result.ok });
  }

  try {
    const convo: ChatMsg[] = [
      { role: "system", content: `${SYSTEM_PROMPT}\nKullanıcı: ${session.name} — rol: ${ROLE_LABELS[session.role as Role] ?? session.role}.` },
      ...parsed.data.messages,
    ];

    // araç döngüsü (en fazla 4 tur)
    for (let turn = 0; turn < 4; turn++) {
      const msg = await ollamaChat(convo);
      const calls = msg.tool_calls ?? [];
      if (calls.length === 0) {
        return NextResponse.json({ reply: msg.content || "Yanıt üretilemedi." });
      }
      // işlem aracı önerildiyse → kullanıcı onayına düşür
      const action = calls.find((c) => ACTION_TOOLS.has(c.function.name));
      if (action) {
        return NextResponse.json({
          reply: msg.content || "Bu işlemi yapmak için onayınız gerekiyor:",
          pendingAction: { tool: action.function.name, args: action.function.arguments },
        });
      }
      // sorgu araçlarını çalıştır, sonuçları modele geri ver
      convo.push(msg);
      for (const c of calls) {
        const result = await runQueryTool(c.function.name, c.function.arguments ?? {}, session, orgId);
        convo.push({ role: "tool", content: JSON.stringify(result) });
      }
    }
    return NextResponse.json({ reply: "İstek çok fazla adım gerektirdi — lütfen daha net sorun." });
  } catch (e) {
    const offline = e instanceof Error && /fetch failed|ECONNREFUSED/i.test(e.message);
    return NextResponse.json(
      { error: offline ? "Yerel yapay zeka servisine (Ollama) ulaşılamadı. `ollama serve` çalışıyor mu?" : "Asistan hatası" },
      { status: 503 }
    );
  }
}
