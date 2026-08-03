import { NextResponse } from "next/server";
import { z } from "zod";
import { apiSession } from "@/lib/auth";

const schema = z.object({
  yil: z.number().int().min(2000).max(2100).optional(),
  orgId: z.string().min(1).optional(),
});

/** Topbar tercihleri: seçili yıl (herkes) ve etkin kurum (süper admin) çerezleri. */
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
  return res;
}
