import type { Metadata } from "next";
import { CommitmentsView } from "@/components/commitments-view";

export const metadata: Metadata = { title: "Commitments" };

export default function CommitmentsPage() {
  return <CommitmentsView />;
}
