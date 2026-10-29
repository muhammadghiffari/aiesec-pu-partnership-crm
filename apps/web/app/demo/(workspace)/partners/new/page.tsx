import type { Metadata } from "next";
import { NewPartnerScreen } from "@/features/demo/screens/NewPartnerScreen";

export const metadata: Metadata = { title: "Add partner — Demo CRM" };

export default function DemoNewPartnerPage() {
  return <NewPartnerScreen />;
}
