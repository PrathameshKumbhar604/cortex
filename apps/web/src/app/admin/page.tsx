import type { Metadata } from "next";
import { AdminView } from "@/components/admin-view";

export const metadata: Metadata = { title: "Admin" };

/** The page itself is public to signed-in people; everything on it comes from /api/admin, which only answers admins. */
export default function AdminPage() {
  return <AdminView />;
}
