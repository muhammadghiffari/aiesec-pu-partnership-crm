import type { Metadata } from "next";
import { PartnersScreen } from "@/features/demo/screens/PartnersScreen";

export const metadata: Metadata = { title: "Partners — Demo CRM" };

export default function DemoPartnersPage() {
  return <PartnersScreen />;
}
