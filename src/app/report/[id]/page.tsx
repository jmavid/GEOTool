import type { Metadata } from "next";
import { ReportView } from "@/components/report-view";
import { turnstileSiteKey } from "@/lib/security/turnstile";
import { emailConfigured } from "@/lib/email/send";

export const metadata: Metadata = { title: "Your AI visibility report | GEO Score", robots: { index: false } };

export default async function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ReportView id={id} turnstileSiteKey={turnstileSiteKey()} trackingLive={emailConfigured()} />;
}
