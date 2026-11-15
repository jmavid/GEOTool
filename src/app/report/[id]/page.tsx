import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { ReportView } from "@/components/report-view";
import type { Viewer } from "@/components/track-cta";
import { currentUser } from "@/lib/auth/session";
import { trackedWebsiteIds } from "@/lib/projects";
import { turnstileSiteKey } from "@/lib/security/turnstile";

export const metadata: Metadata = { title: "Your AI visibility report | GEO Garner", robots: { index: false } };

export default async function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await currentUser();
  let viewer: Viewer = null;
  if (user) {
    const analysis = await getDb().query.analyses.findFirst({ columns: { websiteId: true }, where: eq(schema.analyses.id, id) });
    viewer = { plan: user.plan, tracked: !!analysis && (await trackedWebsiteIds(user.id)).includes(analysis.websiteId) };
  }
  return <ReportView id={id} turnstileSiteKey={turnstileSiteKey()} viewer={viewer} />;
}
