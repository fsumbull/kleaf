import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiSession } from "@/lib/auth";
import { audit } from "@/lib/audit";

const schema = z.object({
  note: z.string().max(500).optional(),
  achievedTCO2e: z.number().min(0, "Negatif olamaz"),
  spentTRY: z.number().min(0).nullable().optional(),
});

/** Eyleme ilerleme kaydı ekler. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await apiSession(["SUPER_ADMIN", "IKLIM_MERKEZI", "MALI_HIZMETLER", "MUDURLUK_VERI"]);
  if (!session) return NextResponse.json({ error: "Yetkiniz yok" }, { status: 403 });

  const { id } = await ctx.params;
  const plan = await prisma.actionPlan.findUnique({ where: { id }, select: { orgId: true } });
  if (!plan || (session.role !== "SUPER_ADMIN" && plan.orgId !== session.orgId)) {
    return NextResponse.json({ error: "Eylem bulunamadı" }, { status: 404 });
  }

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Geçersiz veri" }, { status: 400 });
  }

  const created = await prisma.actionProgress.create({
    data: {
      actionPlanId: id,
      note: parsed.data.note || null,
      achievedTCO2e: parsed.data.achievedTCO2e,
      spentTRY: parsed.data.spentTRY ?? null,
    },
  });
  await audit(session.sub, "EYLEM_ILERLEME", "ActionProgress", created.id, `${parsed.data.achievedTCO2e} tCO2e`);
  return NextResponse.json({ ok: true, id: created.id }, { status: 201 });
}
