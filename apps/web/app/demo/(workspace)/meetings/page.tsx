import type { Metadata } from "next";
import { MeetingsScreen } from "@/features/demo/screens/MeetingsScreen";

export const metadata: Metadata = { title: "Meetings — Demo CRM" };

export default function DemoMeetingsPage() {
  return <MeetingsScreen />;
}
