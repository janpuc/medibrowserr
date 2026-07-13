import { NextResponse, type NextRequest } from "next/server";

/**
 * Optional HTTP Basic Auth for the whole app, enabled by setting
 * MEDIBROWSERR_BASIC_AUTH="user:password". Meant as a lightweight lock for
 * instances that end up reachable beyond the home network — a real auth
 * proxy in front is still the better setup.
 */
const CREDENTIALS = process.env.MEDIBROWSERR_BASIC_AUTH;

/** Constant-time-ish comparison (no early exit on first mismatch). */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function proxy(req: NextRequest) {
  if (!CREDENTIALS) return NextResponse.next();
  // Liveness probes must keep working without credentials.
  if (req.nextUrl.pathname === "/api/health") return NextResponse.next();

  const header = req.headers.get("authorization") ?? "";
  if (header.startsWith("Basic ")) {
    try {
      const presented = atob(header.slice(6));
      if (safeEqual(presented, CREDENTIALS)) return NextResponse.next();
    } catch {
      /* malformed header → 401 below */
    }
  }
  return new NextResponse("Authentication required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="medibrowserr", charset="UTF-8"' },
  });
}

export const config = {
  // Protect everything except Next's static assets (hashed, non-sensitive).
  matcher: ["/((?!_next/static|_next/image).*)"],
};
