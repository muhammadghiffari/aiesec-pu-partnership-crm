import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Partnership CRM — AIESEC in PU",
  description: "Internal BD CRM for AIESEC in President University (ESSM-aligned).",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
