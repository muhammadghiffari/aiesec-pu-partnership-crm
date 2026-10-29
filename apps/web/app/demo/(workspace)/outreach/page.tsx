import type { Metadata } from "next";
import { OutreachScreen } from "@/features/demo/screens/OutreachScreen";

export const metadata: Metadata = { title: "Outreach — Demo CRM" };

export default function DemoOutreachPage() {
  return <OutreachScreen />;
}
