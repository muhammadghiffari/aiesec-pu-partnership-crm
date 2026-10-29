import type { Metadata } from "next";
import { ResearchScreen } from "@/features/demo/screens/ResearchScreen";

export const metadata: Metadata = { title: "Research — Demo CRM" };

export default function DemoResearchPage() {
  return <ResearchScreen />;
}
