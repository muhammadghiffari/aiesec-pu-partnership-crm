import type { Metadata } from "next";
import { SettingsScreen } from "@/features/demo/screens/SettingsScreen";

export const metadata: Metadata = { title: "Settings — Demo CRM" };

export default function DemoSettingsPage() {
  return <SettingsScreen />;
}
