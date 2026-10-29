import type { Metadata } from "next";
import { ContactsScreen } from "@/features/demo/screens/ContactsScreen";

export const metadata: Metadata = { title: "Contacts — Demo CRM" };

export default function DemoContactsPage() {
  return <ContactsScreen />;
}
