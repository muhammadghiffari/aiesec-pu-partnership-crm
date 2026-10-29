import type { Metadata } from "next";
import "./styles/base.css";
import "./styles/components.css";
import "./styles/landing.css";
import { DemoProvider } from "@/features/demo/live/provider";

export const metadata: Metadata = {
  title: "Demo prototype — Partnership CRM",
  description:
    "Presentation prototype of the AIESEC in PU Partnership CRM. Partners and contacts connect to the local development database in demo mode; every other module stays synthetic in-memory data.",
  robots: { index: false, follow: false },
};

/**
 * Demo subtree layout. Providers live here (not in the workspace group) so the
 * demo session survives client navigation between the landing page at /demo and
 * the CRM workspace routes. The DemoProvider stack includes toasts and the
 * runtime bridge (sandbox ⇄ live database mode). The real /partners routes
 * remain untouched.
 */
export default function DemoLayout({ children }: { children: React.ReactNode }) {
  return <DemoProvider>{children}</DemoProvider>;
}
