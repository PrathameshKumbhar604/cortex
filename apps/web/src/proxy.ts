import { NextResponse, type NextRequest } from "next/server";

const COOKIE = "cortex_uid";

/** Gives every browser a stable anonymous id before any route renders. */
export function proxy(request: NextRequest) {
  if (request.cookies.has(COOKIE)) return NextResponse.next();
  const id = crypto.randomUUID();
  request.cookies.set(COOKIE, id); // visible to this same request
  const res = NextResponse.next({ request: { headers: request.headers } });
  res.cookies.set(COOKIE, id, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365 });
  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
