import type { Metadata } from "next";
import { PartnerDetailScreen } from "@/features/demo/screens/PartnerDetailScreen";

export const metadata: Metadata = { title: "Partner profile — Demo CRM" };

export default async function DemoPartnerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <PartnerDetailScreen id={id} />;
}
