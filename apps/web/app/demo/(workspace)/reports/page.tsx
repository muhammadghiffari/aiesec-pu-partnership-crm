import type { Metadata } from "next";
import { ReportsScreen } from "@/features/demo/screens/ReportsScreen";

export const metadata: Metadata = { title: "Reports — Demo CRM" };

export default function DemoReportsPage() {
  return <ReportsScreen />;
}
