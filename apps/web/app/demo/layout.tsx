import type { Metadata } from "next";
import "./styles/base.css";
import "./styles/components.css";
import "./styles/landing.css";
import { DemoProvider } from "@/features/demo/store";
import { ToastProvider } from "@/features/demo/ui/toast";

export const metadata: Metadata = {
  title: "Demo prototype — Partnership CRM",
  description:
    "Presentation prototype of the AIESEC in PU Partnership CRM. Synthetic in-memory data only; no production service is involved.",
  robots: { index: false, follow: false },
};

/**
 * Demo subtree layout. Providers live here (not in the workspace group) so
 * the in-memory demo session survives client navigation between the landing
 * page at /demo and the CRM workspace routes. The real /partners routes
 * remain untouched.
 */
export default function DemoLayout({ children }: { children: React.ReactNode }) {
  return (
    <DemoProvider>
      <ToastProvider>{children}</ToastProvider>
    </DemoProvider>
  );
}
