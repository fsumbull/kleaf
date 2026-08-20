import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiSession, apiOrgId, apiBirim } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { CATEGORIES, CATEGORY_CODES, categoryMeta, ROLE_LABELS, CREDIT_STANDARD_LABELS, CREDIT_STATUS_LABELS, type CategoryCode, type CreditStandard, type CreditStatus, type Role } from "@/lib/constants";
import { VERI_GIRIS_ROLLER, MERKEZ_ONAY_ROLLER, MUDURLUK_ONAY_ROLLER, KREDI_TALEP_ROLLER, BANKA_YONETIM_ROLLER, kategoriYetkisi, birimKisitli } from "@/lib/yetki";
import { approveActivity } from "@/lib/veri";
import { donemKilitli, DONEM_KILIT_MESAJI } from "@/lib/donem";
import { gecisIzinliMi, cuzdanBakiyesi } from "@/lib/kredi";
import type { Session } from "@/lib/session";

/* ── kleaf asistanı — tamamen yerel Ollama; araç çağrıları sunucuda rol/kapsam denetiminden geçer ── */

const OLLAMA_URL = process.env.OLLAMA_URL ?? "http://localhost:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? "qwen2.5:7b-instruct";

const SYSTEM_PROMPT = `Sen "kleaf asistanı"sın — belediye ve kurumlar için sera gazı (karbon) envanteri ile KarbonBank kredi platformunun yerleşik yardımcısısın.
KESIN KURALLAR:
- DİL: Her koşulda YALNIZCA Türkçe yanıt ver. Asla Çince, İngilizce ya da başka bir dil kullanma. Düşünme adımlarını (reasoning) yazma, doğrudan sonucu ver.
- SADECE kleaf platformu konularında yanıt ver: emisyon envanteri, veri girişi, tesisler, onay akışı, raporlar, kategoriler, kapsamlar (Scope 1/2/3), envanter kataloğu, karbon kredisi işlemleri.
- Konu dışı istekleri (genel sohbet, kod yazma, dünya haberleri vb.) kibarca reddet: "Yalnızca kleaf platformuyla ilgili yardımcı olabilirim."
- Veri sorgulamak veya işlem yapmak için SADECE tanımlı araçları kullan. Araç sonucu dışında veri uydurma.
- Yanıtlar Türkçe, kısa ve net olsun. Sayıları binlik ayraçla yaz.
- Kullanıcının rolü sınırlıysa yapamayacağı işlemi araç zaten reddeder; sonucu olduğu gibi aktar.
Kategori kodları: ${CATEGORIES.map((c) => `${c.code}(${c.label}, ${c.unit}, kapsam ${c.scope})`).join(", ")}.`;

/* ── araç tanımları (Ollama tool şeması) — belediye araçları ── */
const BELEDIYE_TOOLS = [
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
  {
    type: "function",
    function: {
      name: "envanter_katalogu",
      description: "Kurumun envanter kataloğu kalemlerini listeler (kalem adı, sorumlu birim, veri birimi, izleme türü). birim ile filtrelenebilir.",
      parameters: {
        type: "object",
        properties: { birim: { type: "string", description: "birim adı filtresi" }, arama: { type: "string", description: "kalem adında geçen sözcük" } },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "kredi_havuzlari",
      description: "Vitrindeki karbon kredisi havuzlarını listeler (id, proje, standart, kalan tCO2e, fiyat ₺/t).",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "kredi_cuzdani",
      description: "Kurumun karbon kredisi cüzdanı: edinilen, mahsup edilen ve kalan tCO2e ile işlem listesi.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "kredi_talep_olustur",
      description: "Karbon kredisi havuzu için satın alma talebi oluşturur. Havuzu kredi_havuzlari ile bulup poolId ver. Kullanıcı onayı gerektirir.",
      parameters: {
        type: "object",
        properties: {
          poolId: { type: "string" },
          amountTCO2e: { type: "number", description: "tCO2e miktarı, pozitif" },
          requestNote: { type: "string" },
        },
        required: ["poolId", "amountTCO2e"],
      },
    },
  },
];

/* ── banka araçları (yalnız KARBON_BANK kurumları) ── */
const BANKA_TOOLS = [
  {
    type: "function",
    function: {
      name: "banka_portfoy_ozeti",
      description: "Bankanın kredi havuzu portföyü: havuzlar, kapasite, kalan bakiye, transfer toplamı ve ciro.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "banka_bekleyen_talepler",
      description: "Bankaya gelen bekleyen kredi taleplerini listeler (id, belediye, havuz, miktar, tutar).",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "banka_talep_onayla",
      description: "Bekleyen kredi talebini onaylar ya da reddeder. id'yi banka_bekleyen_talepler ile bul. Kullanıcı onayı gerektirir.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "string" },
          karar: { type: "string", enum: ["BANKA_ONAY", "RED"] },
          decisionNote: { type: "string" },
        },
        required: ["id", "karar"],
      },
    },
  },
];

/** Kurum tipine göre araç seti — banka kurumu belediye araçlarını göremez, belediye banka araçlarını göremez. */
function toolsFor(orgType: string) {
  return orgType === "KARBON_BANK" ? BANKA_TOOLS : BELEDIYE_TOOLS;
}

/** İşlem araçları — otomatik çalıştırılmaz, kullanıcı onay kartıyla doğrular */
const ACTION_TOOLS = new Set(["veri_taslak_olustur", "veri_onayla", "kredi_talep_olustur", "banka_talep_onayla"]);

/* ── sorgu araçları (salt okuma, org/birim kapsamlı) ── */
async function runQueryTool(name: string, args: Record<string, unknown>, session: Session, orgId: string, birimUnitId?: string): Promise<unknown> {
  const unitFilter = birimUnitId ? { unitId: birimUnitId } : {};
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
    case "envanter_katalogu": {
      const arama = typeof args.arama === "string" ? args.arama.toLocaleLowerCase("tr-TR") : "";
      const items = await prisma.inventoryItem.findMany({
        where: {
          orgId, active: true,
          ...(typeof args.birim === "string" && args.birim ? { unitName: { contains: args.birim } } : {}),
          ...unitFilter,
        },
        select: { name: true, unitName: true, dataUnit: true, mode: true, categoryCode: true },
        orderBy: [{ unitName: "asc" }, { name: "asc" }],
        take: 400,
      });
      const filtered = arama ? items.filter((i) => i.name.toLocaleLowerCase("tr-TR").includes(arama)) : items;
      return { toplam: filtered.length, kalemler: filtered.slice(0, 40).map((i) => ({ kalem: i.name, birim: i.unitName, veri_birimi: i.dataUnit, tur: i.mode === "HESAPLANABILIR" ? "hesaplanabilir" : "izleme", kategori: i.categoryCode })) };
    }
    case "kredi_havuzlari": {
      const pools = await prisma.creditPool.findMany({
        where: { active: true, availableTCO2e: { gt: 0 } },
        include: { bankOrg: { select: { name: true } } },
        orderBy: { priceTRYPerTon: "asc" },
      });
      return pools.map((p) => ({
        id: p.id, proje: p.projectName, banka: p.bankOrg.name,
        standart: CREDIT_STANDARD_LABELS[p.standard as CreditStandard] ?? p.standard,
        vintage: p.vintageYear, kalan_tCO2e: p.availableTCO2e, fiyat_TRY_per_ton: p.priceTRYPerTon,
      }));
    }
    case "kredi_cuzdani": {
      const [islemler, mahsuplar] = await Promise.all([
        prisma.creditTransaction.findMany({
          where: { buyerOrgId: orgId },
          include: { pool: { select: { projectName: true } } },
          orderBy: { createdAt: "desc" }, take: 30,
        }),
        prisma.creditRetirement.findMany({ where: { orgId } }),
      ]);
      const cuzdan = cuzdanBakiyesi(
        islemler.map((t) => ({ status: t.status, amountTCO2e: t.amountTCO2e })),
        mahsuplar.map((m) => ({ amountTCO2e: m.amountTCO2e }))
      );
      return {
        cuzdan,
        islemler: islemler.map((t) => ({
          id: t.id, havuz: t.pool.projectName, miktar_tCO2e: t.amountTCO2e,
          fiyat: t.priceTRYPerTon, durum: CREDIT_STATUS_LABELS[t.status as CreditStatus] ?? t.status,
        })),
      };
    }
    case "banka_portfoy_ozeti": {
      const [pools, txs] = await Promise.all([
        prisma.creditPool.findMany({ where: { bankOrgId: orgId } }),
        prisma.creditTransaction.findMany({ where: { bankOrgId: orgId, status: "TRANSFER" } }),
      ]);
      const satilan = txs.reduce((a, t) => a + t.amountTCO2e, 0);
      return {
        havuz_sayisi: pools.length,
        satisa_acik_tCO2e: pools.filter((p) => p.active).reduce((a, p) => a + p.availableTCO2e, 0),
        transfer_edilen_tCO2e: satilan,
        ciro_TRY: txs.reduce((a, t) => a + t.amountTCO2e * t.priceTRYPerTon, 0),
        havuzlar: pools.map((p) => ({ proje: p.projectName, kalan: p.availableTCO2e, kapasite: p.totalTCO2e, fiyat: p.priceTRYPerTon, vitrinde: p.active })),
      };
    }
    case "banka_bekleyen_talepler": {
      const txs = await prisma.creditTransaction.findMany({
        where: { bankOrgId: orgId, status: "TALEP" },
        include: { pool: { select: { projectName: true, availableTCO2e: true } }, buyerOrg: { select: { name: true } } },
        orderBy: { createdAt: "asc" },
      });
      return txs.map((t) => ({
        id: t.id, belediye: t.buyerOrg.name, havuz: t.pool.projectName,
        miktar_tCO2e: t.amountTCO2e, tutar_TRY: t.amountTCO2e * t.priceTRYPerTon,
        havuz_kalan: t.pool.availableTCO2e, not: t.requestNote,
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
  if (name === "kredi_talep_olustur") {
    if (!KREDI_TALEP_ROLLER.includes(session.role))
      return { ok: false, mesaj: `Kredi talebi yetkiniz yok (rolünüz: ${ROLE_LABELS[session.role as Role] ?? session.role}).` };
    const org = await prisma.organization.findUnique({ where: { id: orgId }, select: { type: true } });
    if (org?.type !== "BELEDIYE") return { ok: false, mesaj: "Kredi talebini yalnız belediye kurumları oluşturabilir." };
    const p = z.object({ poolId: z.string().min(1), amountTCO2e: z.number().positive(), requestNote: z.string().max(300).optional() }).safeParse(rawArgs);
    if (!p.success) return { ok: false, mesaj: "Geçersiz parametre — poolId ve pozitif amountTCO2e gerekli." };
    const pool = await prisma.creditPool.findUnique({ where: { id: p.data.poolId }, include: { bankOrg: { select: { name: true } } } });
    if (!pool || !pool.active) return { ok: false, mesaj: "Havuz bulunamadı ya da vitrinde değil." };
    if (pool.availableTCO2e < p.data.amountTCO2e) return { ok: false, mesaj: `Havuz bakiyesi yetersiz (kalan ${pool.availableTCO2e} tCO₂e).` };
    const tx = await prisma.creditTransaction.create({
      data: {
        poolId: pool.id, bankOrgId: pool.bankOrgId, buyerOrgId: orgId,
        amountTCO2e: p.data.amountTCO2e, priceTRYPerTon: pool.priceTRYPerTon,
        requestNote: p.data.requestNote ?? null, requestedById: session.sub,
      },
    });
    await audit(session.sub, "CHAT_KREDI_TALEP", "CreditTransaction", tx.id, `${pool.bankOrg.name} · ${pool.projectName} · ${p.data.amountTCO2e} tCO₂e (asistan)`, session.email);
    return { ok: true, mesaj: `Talep oluşturuldu: ${pool.projectName} · ${p.data.amountTCO2e} tCO₂e · ${pool.priceTRYPerTon} ₺/t — banka onayı bekleniyor.` };
  }
  if (name === "banka_talep_onayla") {
    if (!BANKA_YONETIM_ROLLER.includes(session.role))
      return { ok: false, mesaj: `Talep kararı yetkiniz yok (rolünüz: ${ROLE_LABELS[session.role as Role] ?? session.role}).` };
    const org = await prisma.organization.findUnique({ where: { id: orgId }, select: { type: true } });
    if (org?.type !== "KARBON_BANK") return { ok: false, mesaj: "Bu işlem yalnız karbon bankası kurumları içindir." };
    const p = z.object({ id: z.string().min(1), karar: z.enum(["BANKA_ONAY", "RED"]), decisionNote: z.string().max(300).optional() }).safeParse(rawArgs);
    if (!p.success) return { ok: false, mesaj: "Geçersiz parametre — id ve karar (BANKA_ONAY|RED) gerekli." };
    const tx = await prisma.creditTransaction.findUnique({
      where: { id: p.data.id },
      include: { pool: { select: { projectName: true, availableTCO2e: true } }, buyerOrg: { select: { name: true } } },
    });
    if (!tx || tx.bankOrgId !== orgId) return { ok: false, mesaj: "İşlem bulunamadı." };
    if (!gecisIzinliMi(tx.status as CreditStatus, p.data.karar, "BANKA"))
      return { ok: false, mesaj: `"${tx.status}" durumundaki işlem için bu karar verilemez.` };
    if (p.data.karar === "BANKA_ONAY" && tx.pool.availableTCO2e < tx.amountTCO2e)
      return { ok: false, mesaj: `Havuz bakiyesi yetersiz (kalan ${tx.pool.availableTCO2e} tCO₂e).` };
    await prisma.creditTransaction.update({
      where: { id: tx.id },
      data: { status: p.data.karar, decisionNote: p.data.decisionNote ?? null, approvedById: session.sub },
    });
    await audit(session.sub, "CHAT_KREDI_ONAY", "CreditTransaction", tx.id, `${tx.buyerOrg.name} · ${tx.pool.projectName} · ${tx.amountTCO2e} tCO₂e → ${p.data.karar} (asistan)`, session.email);
    return { ok: true, mesaj: p.data.karar === "BANKA_ONAY" ? `Talep onaylandı — ${tx.buyerOrg.name} transferi tamamlayabilir.` : "Talep reddedildi." };
  }
  return { ok: false, mesaj: "Bilinmeyen işlem." };
}

/* ── Ollama sohbet döngüsü ── */
interface ChatMsg { role: string; content: string; tool_calls?: { function: { name: string; arguments: Record<string, unknown> } }[] }

async function ollamaChat(messages: ChatMsg[], tools: unknown[]): Promise<ChatMsg> {
  const res = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      messages,
      ...(tools.length ? { tools } : {}),
      stream: false,
      keep_alive: "30m",
      options: {
        temperature: 0.2,
        top_p: 0.9,
        num_predict: 640,
        num_ctx: 4096,
      },
    }),
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
  const orgId = await apiOrgId(session);
  if (!orgId) return NextResponse.json({ error: "Kurum bulunamadı" }, { status: 400 });

  const org = await prisma.organization.findUnique({ where: { id: orgId }, select: { name: true, type: true } });
  if (!org) return NextResponse.json({ error: "Kurum bulunamadı" }, { status: 400 });
  const tools = toolsFor(org.type);
  const toolNames = new Set(tools.map((t) => t.function.name));

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Geçersiz istek" }, { status: 400 });

  // kullanıcı onay kartından gelen işlem — LLM'e gitmeden sunucuda doğrulanıp çalıştırılır
  if (parsed.data.confirm) {
    const { tool, args } = parsed.data.confirm;
    if (!ACTION_TOOLS.has(tool) || !toolNames.has(tool)) return NextResponse.json({ error: "Geçersiz işlem" }, { status: 400 });
    const result = await runActionTool(tool, args, session, orgId);
    return NextResponse.json({ reply: result.mesaj, ok: result.ok });
  }

  try {
    // etkin birim kapsamı — müdürlük kilitli, kurum-geneli roller kleaf_birim çerezini izler
    const birim = await apiBirim(session, orgId);
    const kapsamSatiri = [
      `Kurum: ${org.name} (${org.type === "KARBON_BANK" ? "karbon bankası" : "belediye"}).`,
      `Kullanıcı: ${session.name} — rol: ${ROLE_LABELS[session.role as Role] ?? session.role}.`,
      birim.kilitli && birim.adi
        ? `Erişim sınırı: yalnız "${birim.adi}" birimi verileri — diğer birimlerin verilerine erişemez, sorduğunda bunu belirt.`
        : !birim.kilitli && birim.adi
          ? `Şu an "${birim.adi}" birimi filtresi etkin — yanıtlar bu birimle sınırlı; tüm kuruma bakmak için üstteki birim filtresini kaldır.`
          : "Erişim: kurum geneli (tüm birimler).",
      org.type === "KARBON_BANK"
        ? "Bu kurum karbon bankasıdır: emisyon envanteri araçları yoktur; havuz, talep ve portföy araçlarını kullan."
        : "",
    ].filter(Boolean).join("\n");

    const convo: ChatMsg[] = [
      { role: "system", content: `${SYSTEM_PROMPT}\n${kapsamSatiri}` },
      ...parsed.data.messages,
    ];

    // araç döngüsü (en fazla 4 tur)
    for (let turn = 0; turn < 4; turn++) {
      const msg = await ollamaChat(convo, tools);
      const calls = (msg.tool_calls ?? []).filter((c) => toolNames.has(c.function.name));
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
        const result = await runQueryTool(c.function.name, c.function.arguments ?? {}, session, orgId, birim.unitId);
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
