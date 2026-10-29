import type { Metadata } from "next";
import { ProjectsScreen } from "@/features/demo/screens/ProjectsScreen";

export const metadata: Metadata = { title: "Projects — Demo CRM" };

export default function DemoProjectsPage() {
  return <ProjectsScreen />;
}
