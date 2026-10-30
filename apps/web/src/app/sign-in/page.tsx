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
  const to = typeof next === "string" && next.startsWith("/") && !next.startsWith("//") ? next : "/"; // same-site paths only
  if (await session()) redirect(to);
  return <SignIn next={to} />;
}
