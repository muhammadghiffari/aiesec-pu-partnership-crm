/** /partners/new — accessible partner creation (M1-03). */
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Add partner — CRM" };

export default function NewPartnerPage() {
  return (
    <main>
      <h1>Add a partner</h1>
      <p>
        <a href="/partners">Back to the partner list</a>
      </p>
      <p role="alert">
        Partner creation is temporarily unavailable. No changes can be saved until the authenticated
        backend is connected.
      </p>
    </main>
  );
}
