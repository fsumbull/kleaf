import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiSession } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { ACTION_LABELS } from "@/lib/audit-labels";

const MAX_ROWS = 5000;

function csvCell(v: string): string {
  return /[",;\n]/.test(v) ? `"${v.replaceAll('"', '""')}"` : v;
}

/** Denetim izini CSV olarak dışa aktarır — sayfadaki filtrelerle aynı parametreler. */
export async function GET(req: Request) {
  const s = await apiSession(["SUPER_ADMIN", "SISTEM_YONETICISI", "IKLIM_MERKEZI"]);
  if (!s) return NextResponse.json({ error: "Yetkisiz" }, { status: 403 });

  const url = new URL(req.url);
  const eylem = url.searchParams.get("eylem")?.trim() || undefined;
  const kullanici = url.searchParams.get("kullanici")?.trim() || undefined;
  const bas = url.searchParams.get("bas") || undefined;   // YYYY-MM-DD
  const bit = url.searchParams.get("bit") || undefined;

  const basD = bas ? new Date(`${bas}T00:00:00`) : undefined;
  const bitD = bit ? new Date(`${bit}T23:59:59.999`) : undefined;
  if ((basD && isNaN(+basD)) || (bitD && isNaN(+bitD)))
    return NextResponse.json({ error: "Geçersiz tarih" }, { status: 400 });

  const where = {
    ...(s.role === "SUPER_ADMIN" ? {} : { user: { orgId: s.orgId } }),
    ...(eylem ? { action: eylem } : {}),
    ...(kullanici ? {
      OR: [
        { user: { email: { contains: kullanici } } },
        { user: { name: { contains: kullanici } } },
        { actorEmail: { contains: kullanici } },
      ],
    } : {}),
    ...(basD || bitD ? { createdAt: { ...(basD ? { gte: basD } : {}), ...(bitD ? { lte: bitD } : {}) } } : {}),
  };

  const logs = await prisma.auditLog.findMany({
    where,
    include: { user: { select: { name: true, email: true } } },
    orderBy: { createdAt: "desc" },
    take: MAX_ROWS,
  });

  const header = "zaman;kullanici;eposta;islem;nesne;nesne_id;ayrinti";
  const lines = logs.map((l) => {
    const zaman = l.createdAt.toLocaleString("tr-TR", { timeZone: "Europe/Istanbul" });
    const ad = l.user?.name ?? (l.actorEmail ? "(silinmiş)" : "—");
    const email = l.user?.email ?? l.actorEmail ?? "";
    const islem = ACTION_LABELS[l.action]?.label ?? l.action;
    return [zaman, ad, email, islem, l.entity, l.entityId ?? "", l.detail ?? ""].map(csvCell).join(";");
  });
  const csv = "\uFEFF" + [header, ...lines].join("\n");

  await audit(s.sub, "DENETIM_EXPORT", "AuditLog", null, `${logs.length} kayıt CSV dışa aktarıldı`, s.email);

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="denetim-izi-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
