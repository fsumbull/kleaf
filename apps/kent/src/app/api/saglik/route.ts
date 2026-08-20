/**
 * Sağlık ucu — kimlik doğrulaması gerektirmez (middleware istisnası).
 * Docker HEALTHCHECK / yük dengeleyici sondaları için: DB erişimini doğrular.
 *   HEALTHCHECK CMD curl -sf http://localhost:3000/api/saglik || exit 1
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { CALC_VERSION } from "@/lib/carbon/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({
      status: "ok",
      db: "ok",
      calcVersion: CALC_VERSION,
      time: new Date().toISOString(),
    });
  } catch {
    return NextResponse.json({ status: "error", db: "unreachable" }, { status: 503 });
  }
}
