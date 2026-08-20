import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiSession } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { approveActivity } from "@/lib/veri";

const bodySchema = z.object({
  ids: z.array(z.string().min(1)).min(1, "Kayıt seçin").max(200, "Tek seferde en fazla 200 kayıt"),
});

/** Seçili taslak kayıtları topluca onaylar — yalnız yönetici. */
export async function POST(req: Request) {
  const session = await apiSession(["SUPER_ADMIN", "IKLIM_MERKEZI"]);
  if (!session) return NextResponse.json({ error: "Onay yetkisi yöneticidedir" }, { status: 403 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Geçersiz istek" }, { status: 400 });

  // kapsam denetimi: yalnız kendi kurumunun taslak kayıtları
  const acts = await prisma.activityData.findMany({
    where: {
      id: { in: parsed.data.ids },
      status: "TASLAK",
      ...(session.role === "SUPER_ADMIN" ? {} : { facility: { orgId: session.orgId ?? "—" } }),
    },
    select: { id: true, facility: { select: { orgId: true } } },
  });
  if (acts.length === 0) return NextResponse.json({ error: "Onaylanacak taslak kayıt bulunamadı" }, { status: 404 });

  let onaylanan = 0;
  const hatalar: string[] = [];
  for (const a of acts) {
    try {
      await approveActivity(a.id, a.facility.orgId);
      onaylanan++;
    } catch (e) {
      hatalar.push(e instanceof Error ? e.message : "onay hatası");
    }
  }

  await audit(
    session.sub, "VERI_TOPLU_ONAY", "ActivityData", null,
    `${onaylanan} kayıt onaylandı${hatalar.length ? `, ${hatalar.length} hata` : ""}`, session.email
  );
  return NextResponse.json({ ok: true, onaylanan, hata: hatalar.length ? hatalar[0] : null });
}
