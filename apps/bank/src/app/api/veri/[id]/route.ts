import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiSession } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { approveActivity, revertActivity, getOwnedActivity, mudurlukOnayla } from "@/lib/veri";
import { donemKilitli, DONEM_KILIT_MESAJI } from "@/lib/donem";
import { VERI_GIRIS_ROLLER, MERKEZ_ONAY_ROLLER, kategoriYetkisi, birimKisitli } from "@/lib/yetki";

const patchSchema = z.object({
  amount: z.number().min(0).optional(),
  documentRef: z.string().max(200).nullable().optional(),
  status: z.enum(["TASLAK", "MUDURLUK_ONAYLI", "ONAYLI"]).optional(),
  anomalyOk: z.boolean().optional(), // aykırı değer doğrulandı işareti — yönetici
});

type Ctx = { params: Promise<{ id: string }> };

/** Kayıt güncelleme + üç aşamalı onay akışı (TASLAK → MUDURLUK_ONAYLI → ONAYLI). */
export async function PATCH(req: Request, ctx: Ctx) {
  const session = await apiSession([...VERI_GIRIS_ROLLER, "MUDURLUK_ONAY"]);
  if (!session) return NextResponse.json({ error: "Yetkiniz yok" }, { status: 403 });

  const { id } = await ctx.params;
  const act = await getOwnedActivity(id, session.orgId, session.role === "SUPER_ADMIN");
  if (!act) return NextResponse.json({ error: "Kayıt bulunamadı" }, { status: 404 });

  // birim kısıtlı roller yalnız kendi müdürlüğünün tesislerine dokunur
  if (birimKisitli(session.role) && act.facility.unitId !== session.unitId)
    return NextResponse.json({ error: "Bu kayıt müdürlüğünüzün kapsamında değil" }, { status: 403 });
  // alan uzmanı roller yalnız kendi kategorilerine dokunur
  if (!kategoriYetkisi(session.role, act.category) && session.role !== "MUDURLUK_ONAY")
    return NextResponse.json({ error: "Bu kategori için yetkiniz yok" }, { status: 403 });
  // dönem kilidi
  if (await donemKilitli(act.facility.orgId, act.year, act.month))
    return NextResponse.json({ error: DONEM_KILIT_MESAJI }, { status: 403 });

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Geçersiz veri" }, { status: 400 });
  const d = parsed.data;

  const isAdmin = MERKEZ_ONAY_ROLLER.includes(session.role);

  // anomali doğrulama işareti — skor aykırılarından düşer
  if (d.anomalyOk !== undefined) {
    if (!isAdmin) return NextResponse.json({ error: "Anomali doğrulama yetkisi yöneticidedir" }, { status: 403 });
    await prisma.activityData.update({ where: { id }, data: { anomalyOk: d.anomalyOk } });
    await audit(session.sub, "VERI_ANOMALI_ONAY", "ActivityData", id, d.anomalyOk ? "doğrulandı" : "işaret kaldırıldı", session.email);
  }

  // içerik güncellemesi
  if (d.amount !== undefined || d.documentRef !== undefined) {
    await prisma.activityData.update({
      where: { id },
      data: {
        ...(d.amount !== undefined ? { amount: d.amount } : {}),
        ...(d.documentRef !== undefined ? { documentRef: d.documentRef } : {}),
      },
    });
    // onaylı kayıt değiştiyse hesap güncel kalsın: yönetici → yeniden hesap; sorumlu → taslağa düşür
    if (act.status === "ONAYLI" && d.status === undefined) {
      if (isAdmin) await approveActivity(id, act.facility.orgId);
      else await revertActivity(id);
    }
    await audit(session.sub, "VERI_GUNCELLE", "ActivityData", id, d.amount !== undefined ? `miktar=${d.amount}` : undefined);
  }

  // durum geçişi
  if (d.status === "ONAYLI") {
    if (!isAdmin) return NextResponse.json({ error: "Nihai onay yetkisi iklim merkezindedir" }, { status: 403 });
    try {
      const t = await approveActivity(id, act.facility.orgId);
      await audit(session.sub, "VERI_ONAYLA", "ActivityData", id, `${t.toFixed(3)} tCO2e`);
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : "Onay başarısız" }, { status: 422 });
    }
  } else if (d.status === "MUDURLUK_ONAYLI") {
    if (!isAdmin && session.role !== "MUDURLUK_ONAY")
      return NextResponse.json({ error: "Müdürlük onayı yetkisi yok" }, { status: 403 });
    if (act.status === "ONAYLI")
      return NextResponse.json({ error: "Onaylı kayıt geri müdürlük onayına alınamaz" }, { status: 400 });
    await mudurlukOnayla(id);
    await audit(session.sub, "VERI_MUDURLUK_ONAY", "ActivityData", id, `${act.category} ${act.year}-${act.month}`, session.email);
  } else if (d.status === "TASLAK" && act.status !== "TASLAK") {
    if (act.status === "ONAYLI" && !isAdmin)
      return NextResponse.json({ error: "Onay geri alma yetkisi yöneticidedir" }, { status: 403 });
    await revertActivity(id);
    await audit(session.sub, "VERI_ONAY_GERI_AL", "ActivityData", id);
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const session = await apiSession(VERI_GIRIS_ROLLER);
  if (!session) return NextResponse.json({ error: "Yetkiniz yok" }, { status: 403 });

  const { id } = await ctx.params;
  const act = await getOwnedActivity(id, session.orgId, session.role === "SUPER_ADMIN");
  if (!act) return NextResponse.json({ error: "Kayıt bulunamadı" }, { status: 404 });

  if (birimKisitli(session.role) && act.facility.unitId !== session.unitId)
    return NextResponse.json({ error: "Bu kayıt müdürlüğünüzün kapsamında değil" }, { status: 403 });
  if (!kategoriYetkisi(session.role, act.category))
    return NextResponse.json({ error: "Bu kategori için yetkiniz yok" }, { status: 403 });
  if (await donemKilitli(act.facility.orgId, act.year, act.month))
    return NextResponse.json({ error: DONEM_KILIT_MESAJI }, { status: 403 });

  const isAdmin = MERKEZ_ONAY_ROLLER.includes(session.role);
  if (act.status === "ONAYLI" && !isAdmin) {
    return NextResponse.json({ error: "Onaylı kaydı yalnız yönetici silebilir" }, { status: 403 });
  }

  await prisma.activityData.delete({ where: { id } }); // hesap izi cascade silinir
  await audit(session.sub, "VERI_SIL", "ActivityData", id, `${act.category} ${act.year}-${act.month}`);
  return NextResponse.json({ ok: true });
}
