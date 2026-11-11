import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { SignIn } from "@/components/sign-in";
import { session } from "@/server/cortex";

export const metadata: Metadata = { title: "Sign in" };

export default function SignInPage({ searchParams }: PageProps<"/sign-in">) {
  return (
    <Suspense fallback={null}>
      <SignInForVisitor searchParams={searchParams} />
    </Suspense>
  );
}

async function SignInForVisitor({ searchParams }: Pick<PageProps<"/sign-in">, "searchParams">) {
  const { next } = await searchParams;
  // Same-site paths only. Browsers read "/\host" as "//host", so a backslash (or a control character) is refused too.
  const to = typeof next === "string" && next.startsWith("/") && !next.startsWith("//") && !/[\\\u0000-\u001f]/.test(next) ? next : "/";
  if (await session()) redirect(to);
  return <SignIn next={to} />;
}
