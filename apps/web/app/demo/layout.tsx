import type { Metadata } from "next";
import "./styles/base.css";
import "./styles/components.css";
import { Shell } from "@/features/demo/shell/Shell";
import { DemoProvider } from "@/features/demo/store";
import { ToastProvider } from "@/features/demo/ui/toast";

export const metadata: Metadata = {
  title: "Demo prototype — Partnership CRM",
  description:
    "Presentation prototype of the AIESEC in PU Partnership CRM. Synthetic in-memory data only; no production service is involved.",
  robots: { index: false, follow: false },
};

/**
 * Demo subtree layout. Deliberately self-contained: providers hold the
 * in-memory synthetic dataset and every screen reads from it. The real
 * /partners routes remain untouched.
 */
export default function DemoLayout({ children }: { children: React.ReactNode }) {
  return (
    <DemoProvider>
      <ToastProvider>
        <Shell>{children}</Shell>
      </ToastProvider>
    </DemoProvider>
  );
}
