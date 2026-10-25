import { Suspense } from "react";
import { AskView } from "@/components/ask/ask-view";
import { session } from "@/server/cortex";

export default function AskPage() {
  return (
    <Suspense fallback={null}>
      <AskWithSession />
    </Suspense>
  );
}

async function AskWithSession() {
  const { workspace } = await session();
  return <AskView workspace={workspace} />;
}
