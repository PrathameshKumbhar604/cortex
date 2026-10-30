import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { AdminView } from "@/components/admin-view";
import { session } from "@/server/cortex";

export const metadata: Metadata = { title: "Admin" };

/** Admins only: everyone else gets a 404, as if the page did not exist. /api/admin checks the role again. */
export default function AdminPage() {
  return (
    <Suspense fallback={null}>
      <AdminOnly />
    </Suspense>
  );
}

async function AdminOnly() {
  const sess = await session();
  if (!sess) redirect("/sign-in");
  if (!sess.admin) notFound();
  return <AdminView />;
}
