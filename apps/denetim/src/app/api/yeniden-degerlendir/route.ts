import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiSession } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { KLEAF_DENETCI_ROLLER } from "@/lib/yetki";
import { reevaluateTransaction } from "@/lib/compliance";

/** Yeniden değerlendir — POST /api/yeniden-degerlendir  Body: { transactionId } */
const schema = z.object({ transactionId: z.string().min(1) });

export async function POST(req: Request) {
  const s = await apiSession(KLEAF_DENETCI_ROLLER);
  if (!s) return NextResponse.json({ error: "Yetkiniz yok" }, { status: 403 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Geçersiz veri" }, { status: 400 });

  const sonuc = await reevaluateTransaction(parsed.data.transactionId, prisma);
  await audit(s.sub, "DENETIM_YENIDEN_DEGERLENDIR", "CreditTransaction", parsed.data.transactionId, `${sonuc.yeniBayrak} yeni bayrak`, s.email);
  return NextResponse.json({ ok: true, ...sonuc });
}
