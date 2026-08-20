import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/session";
import { getSession } from "@/lib/auth";
import { audit } from "@/lib/audit";

export async function POST(req: Request) {
  const s = await getSession();
  if (s) await audit(s.sub, "CIKIS", "User", s.sub, s.email, s.email);
  const res = NextResponse.redirect(new URL("/giris", req.url), 303);
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
