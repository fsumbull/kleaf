/**
 * Veritabanı yedeği — yalnızca SUPER_ADMIN. SQLite dosyasını olduğu gibi akıtır.
 * Harici veritabanı (Postgres vb.) kullanılıyorsa 501 döner; pg_dump ile yedek alınmalıdır.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { apiSession } from "@/lib/auth";
import { audit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await apiSession(["SUPER_ADMIN"]);
  if (!session) return NextResponse.json({ error: "Yetki gerekli" }, { status: 403 });

  const url = process.env.DATABASE_URL ?? "";
  const m = url.match(/^file:(.+)$/);
  if (!m) {
    return NextResponse.json(
      { error: "Harici veritabanı kullanılıyor — yedek için pg_dump kullanın" },
      { status: 501 },
    );
  }
  const p = path.isAbsolute(m[1]) ? m[1] : path.join(process.cwd(), "prisma", m[1]);

  let buf: Buffer;
  try {
    buf = await fs.readFile(p);
  } catch {
    return NextResponse.json({ error: "Veritabanı dosyası okunamadı" }, { status: 500 });
  }

  await audit(session.sub, "SISTEM_YEDEK", "System", null, `db yedeği indirildi (${(buf.length / 1024 / 1024).toFixed(1)} MB)`);

  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename="kleaf-yedek-${stamp}.db"`,
    },
  });
}
