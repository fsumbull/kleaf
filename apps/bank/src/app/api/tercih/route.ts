import { NextResponse } from "next/server";
import { z } from "zod";
import { apiSession, apiOrgId } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { birimKisitli } from "@/lib/yetki";

const schema = z.object({
  yil: z.number().int().min(2000).max(2100).optional(),
  orgId: z.string().min(1).optional(),
  birim: z.string().optional(),
});

/** Topbar tercihleri: seçili yıl (herkes), etkin kurum (süper admin), etkin birim (kurum-geneli roller). */
export async function POST(req: Request) {
  const session = await apiSession();
  if (!session) return NextResponse.json({ error: "Oturum gerekli" }, { status: 401 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Geçersiz istek" }, { status: 400 });

  const res = NextResponse.json({ ok: true });
  const opts = { path: "/", sameSite: "lax" as const, maxAge: 60 * 60 * 24 * 30 };
  if (parsed.data.yil) res.cookies.set("kleaf_yil", String(parsed.data.yil), opts);
  if (parsed.data.orgId && session.role === "SUPER_ADMIN") {
    res.cookies.set("kleaf_org", parsed.data.orgId, opts);
  }
  if (parsed.data.birim !== undefined) {
    // müdürlük rolleri kendi birimine kilitli — birim değiştiremez
    if (birimKisitli(session.role)) return NextResponse.json({ error: "Birim değiştirilemez" }, { status: 403 });
    const birim = parsed.data.birim;
    if (birim === "") {
      res.cookies.set("kleaf_birim", "", { ...opts, maxAge: 0 });
    } else {
      const orgId = await apiOrgId(session);
      const unit = orgId ? await prisma.unit.findUnique({ where: { id: birim }, select: { orgId: true } }) : null;
      if (!unit || unit.orgId !== orgId) return NextResponse.json({ error: "Birim bulunamadı" }, { status: 404 });
      res.cookies.set("kleaf_birim", birim, opts);
    }
  }
  return res;
}
