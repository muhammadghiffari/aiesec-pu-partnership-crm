/** /partners/new — accessible partner creation (M1-03). */
import type { Metadata } from "next";
import { PartnerForm } from "@/features/partners/PartnerForm";

export const metadata: Metadata = { title: "Add partner — CRM" };

export default function NewPartnerPage() {
  return (
    <main>
      <h1>Add a partner</h1>
      <p>
        <a href="/partners">Back to the partner list</a>
      </p>
      <PartnerForm />
    </main>
  );
}
