import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiSession } from "@/lib/auth";
import { audit } from "@/lib/audit";

const patchSchema = z.object({
  note: z.string().max(500).optional(),
  achievedTCO2e: z.number().min(0, "Negatif olamaz").optional(),
  spentTRY: z.number().min(0).nullable().optional(),
});

type Ctx = { params: Promise<{ id: string; pid: string }> };

/** İlerleme kaydını sahiplik denetimiyle getirir. */
async function getOwnedProgress(id: string, pid: string, orgId: string | null, isSuper: boolean) {
  const pr = await prisma.actionProgress.findUnique({
    where: { id: pid },
    include: { actionPlan: { select: { id: true, orgId: true, title: true } } },
  });
  if (!pr || pr.actionPlan.id !== id) return null;
  if (!isSuper && pr.actionPlan.orgId !== orgId) return null;
  return pr;
}

/** İlerleme kaydını günceller. */
export async function PATCH(req: Request, ctx: Ctx) {
  const session = await apiSession(["SUPER_ADMIN", "IKLIM_MERKEZI", "MALI_HIZMETLER", "MUDURLUK_VERI"]);
  if (!session) return NextResponse.json({ error: "Yetkiniz yok" }, { status: 403 });

  const { id, pid } = await ctx.params;
  const pr = await getOwnedProgress(id, pid, session.orgId, session.role === "SUPER_ADMIN");
  if (!pr) return NextResponse.json({ error: "İlerleme kaydı bulunamadı" }, { status: 404 });

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Geçersiz veri" }, { status: 400 });
  }
  const d = parsed.data;

  await prisma.actionProgress.update({
    where: { id: pid },
    data: {
      ...(d.note !== undefined ? { note: d.note || null } : {}),
      ...(d.achievedTCO2e !== undefined ? { achievedTCO2e: d.achievedTCO2e } : {}),
      ...(d.spentTRY !== undefined ? { spentTRY: d.spentTRY } : {}),
    },
  });
  await audit(session.sub, "EYLEM_ILERLEME_GUNCELLE", "ActionProgress", pid,
    d.achievedTCO2e !== undefined ? `${d.achievedTCO2e} tCO2e` : undefined, session.email);
  return NextResponse.json({ ok: true });
}

/** İlerleme kaydını siler. */
export async function DELETE(_req: Request, ctx: Ctx) {
  const session = await apiSession(["SUPER_ADMIN", "IKLIM_MERKEZI", "MALI_HIZMETLER", "MUDURLUK_VERI"]);
  if (!session) return NextResponse.json({ error: "Yetkiniz yok" }, { status: 403 });

  const { id, pid } = await ctx.params;
  const pr = await getOwnedProgress(id, pid, session.orgId, session.role === "SUPER_ADMIN");
  if (!pr) return NextResponse.json({ error: "İlerleme kaydı bulunamadı" }, { status: 404 });

  await prisma.actionProgress.delete({ where: { id: pid } });
  await audit(session.sub, "EYLEM_ILERLEME_SIL", "ActionProgress", pid, pr.actionPlan.title, session.email);
  return NextResponse.json({ ok: true });
}
