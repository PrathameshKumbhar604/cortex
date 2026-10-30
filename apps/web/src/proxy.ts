import { NextResponse } from "next/server";
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const ANON = "cortex_uid";
const isPublic = createRouteMatcher(["/sign-in(.*)", "/sso-callback(.*)"]);

/**
 * Signed-out visitors go to /sign-in (API calls get 401). Every route still checks the session itself. The anonymous
 * id lets the first sign-in on a browser keep what was set up before it.
 */
// Without Clerk keys nothing can sign in: say so plainly instead of every page failing with a 500.
const configured = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY);
const SETUP = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Set up sign-in · Cortex</title>
<body style="font:15px/1.6 system-ui,sans-serif;max-width:560px;margin:12vh auto;padding:0 20px;color:#0e1116">
<h1 style="font-weight:400;font-size:26px">Cortex needs its sign-in keys</h1>
<p>Sign-in runs on Clerk. Create a free Clerk application at <b>dashboard.clerk.com</b>, open <b>API keys</b>, and add these two lines to the <code>.env</code> file at the root of the project:</p>
<pre style="background:#f3f4f7;padding:12px;border-radius:8px">NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_…
CLERK_SECRET_KEY=sk_test_…</pre>
<p>Then restart the web app. Google, GitHub and email sign-in work straight away in development.</p></body>`;

const withClerk = clerkMiddleware(async (auth, request) => {
  const { pathname } = request.nextUrl;
  if (!isPublic(request) && !(await auth()).userId) {
    if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Sign in to continue." }, { status: 401 });
    const to = new URL("/sign-in", request.url);
    if (pathname !== "/") to.searchParams.set("next", pathname + request.nextUrl.search);
    return NextResponse.redirect(to);
  }
  if (request.cookies.has(ANON)) return NextResponse.next();
  const id = crypto.randomUUID();
  request.cookies.set(ANON, id); // visible to this same request
  const res = NextResponse.next({ request: { headers: request.headers } });
  res.cookies.set(ANON, id, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365 });
  return res;
});

export default configured ? withClerk : () => new NextResponse(SETUP, { status: 503, headers: { "content-type": "text/html; charset=utf-8" } });

export const config = {
  // Clerk's recommended matcher: every page and API route, never Next internals or static files.
  matcher: ["/((?!_next|[^?]*\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)", "/(api|trpc)(.*)"],
};
