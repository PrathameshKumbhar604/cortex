import { Suspense } from "react";
import { AskView } from "@/components/ask/ask-view";
import { redirect } from "next/navigation";
import { session } from "@/server/cortex";

export default function AskPage() {
  return (
    <Suspense fallback={null}>
      <AskWithSession />
    </Suspense>
  );
}

async function AskWithSession() {
  const sess = await session();
  if (!sess) redirect("/sign-in");
  return <AskView workspace={sess.workspace} />;
}
