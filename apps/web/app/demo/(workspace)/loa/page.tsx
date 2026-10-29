import type { Metadata } from "next";
import { LoaScreen } from "@/features/demo/screens/LoaScreen";

export const metadata: Metadata = { title: "Letters of Agreement — Demo CRM" };

export default function DemoLoaPage() {
  return <LoaScreen />;
}
