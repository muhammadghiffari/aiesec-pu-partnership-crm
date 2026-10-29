import { Shell } from "@/features/demo/shell/Shell";

/**
 * CRM workspace shell (sidebar, top bar, demo banner) for every /demo route
 * except the landing page. The route group adds no URL segment.
 */
export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  return <Shell>{children}</Shell>;
}
