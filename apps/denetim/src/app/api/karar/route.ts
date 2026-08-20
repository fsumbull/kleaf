import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiSession } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { KLEAF_DENETCI_ROLLER } from "@/lib/yetki";

/**
 * Denetçi karar API — POST /api/karar
 * Body: { transactionId, karar: "ONAY"|"ASKI"|"ITIRAZ", not? }
 *
 * ASKI: tx.status = "DENETIM_ASKI"; askiOncesiStatus'a önceki status yazılır.
 * ONAY: DENETIM_ASKI ise askiOncesiStatus'a geri döner (yoksa değişmez).
 * ITIRAZ: karar kaydı oluşur, tx durumu değişmez (kalıcı flag).
 */
const bodySchema = z.object({
  transactionId: z.string().min(1),
  karar: z.enum(["ONAY", "ASKI", "ITIRAZ"]),
  not: z.string().max(500).optional(),
});

export async function POST(req: Request) {
  const s = await apiSession(KLEAF_DENETCI_ROLLER);
  if (!s) return NextResponse.json({ error: "Yetkiniz yok" }, { status: 403 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Geçersiz veri" }, { status: 400 });
  const d = parsed.data;

  const tx = await prisma.creditTransaction.findUnique({
    where: { id: d.transactionId },
    select: { id: true, status: true, askiOncesiStatus: true, buyerOrgId: true, amountTCO2e: true, pool: { select: { projectName: true } } },
  });
  if (!tx) return NextResponse.json({ error: "İşlem bulunamadı" }, { status: 404 });

  await prisma.$transaction(async (p) => {
    if (d.karar === "ASKI" && tx.status !== "DENETIM_ASKI") {
      await p.creditTransaction.update({
        where: { id: tx.id },
        data: { status: "DENETIM_ASKI", askiOncesiStatus: tx.status },
      });
    } else if (d.karar === "ONAY" && tx.status === "DENETIM_ASKI") {
      await p.creditTransaction.update({
        where: { id: tx.id },
        data: { status: tx.askiOncesiStatus ?? "TALEP", askiOncesiStatus: null },
      });
    }
    await p.auditDecision.create({
      data: { transactionId: tx.id, denetciId: s.sub, karar: d.karar, not: d.not },
    });
  });

  await audit(
    s.sub,
    d.karar === "ASKI" ? "DENETIM_ASKI" : d.karar === "ONAY" ? "DENETIM_ONAY" : "DENETIM_ITIRAZ",
    "CreditTransaction", tx.id,
    `${tx.pool.projectName} · ${tx.amountTCO2e} tCO₂e · ${d.karar}${d.not ? " — " + d.not : ""}`,
    s.email
  );

  return NextResponse.json({ ok: true });
}
