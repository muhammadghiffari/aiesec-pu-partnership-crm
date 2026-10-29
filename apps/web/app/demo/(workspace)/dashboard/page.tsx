import type { Metadata } from "next";
import { DashboardScreen } from "@/features/demo/screens/DashboardScreen";

export const metadata: Metadata = { title: "Overview — Demo CRM" };

export default function DemoOverviewPage() {
  return <DashboardScreen />;
}
