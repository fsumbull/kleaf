import { prisma } from "./prisma";

/** Önemli mutasyonları denetim iziyle kaydeder — hata yutulur (ana akışı bozmaz). */
export async function audit(
  userId: string | null,
  action: string,
  entity: string,
  entityId?: string | null,
  detail?: string,
  actorEmail?: string | null
) {
  try {
    // e-posta anlık görüntüsü — kullanıcı silinse bile iz okunabilir kalır
    let email = actorEmail ?? null;
    if (!email && userId) {
      const u = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
      email = u?.email ?? null;
    }
    await prisma.auditLog.create({
      data: {
        userId,
        actorEmail: email,
        action,
        entity,
        entityId: entityId ?? null,
        detail: detail ?? null,
      },
    });
  } catch (e) {
    console.error("audit yazılamadı:", e);
  }
}
