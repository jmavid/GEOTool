import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";
import { LEGAL_UPDATED, operator } from "@/lib/legal";

export const metadata: Metadata = { title: "Terms | GEO Garner" };

export default function TermsPage() {
  const { name, email } = operator();
  return (
    <LegalPage title="Terms" updated={LEGAL_UPDATED}>
      <p>These terms cover your use of GEO Garner, run by {name}. By using the service you accept them.</p>

      <h2>The service</h2>
      <p>
        GEO Garner asks AI models questions a buyer might ask and reports how they mention and recommend a brand. AI answers vary from one run to the
        next and can be wrong: treat scores and recommendations as guidance, not a guarantee of results.
      </p>

      <h2>Accounts</h2>
      <p>Keep access to your email address safe: it is how you sign in. You are responsible for what is done with your account.</p>

      <h2>Plans and billing</h2>
      <ul>
        <li>Paid plans are monthly subscriptions, charged in advance through Stripe, taxes included where they apply.</li>
        <li>You can change plan or cancel anytime from the Account page. A cancellation takes effect at the end of the paid month.</li>
        <li>Deleting your account cancels the subscription at once. Unless the law requires otherwise, partial months aren&apos;t refunded.</li>
        <li>We may change prices with at least 30 days&apos; notice by email; the change applies from your next billing period.</li>
      </ul>

      <h2>Fair use</h2>
      <p>
        Don&apos;t try to get around plan limits or bot checks, overload the service, or use it for anything unlawful. We may suspend accounts that
        do.
      </p>

      <h2>Liability</h2>
      <p>
        The service is provided as is. To the extent the law allows, our liability is limited to what you paid us in the last 12 months. Nothing here
        limits rights you have as a consumer.
      </p>

      <h2>Changes</h2>
      <p>
        We&apos;ll email account holders about material changes to these terms before they apply.
        {email && (
          <>
            {" "}
            Questions: <a href={`mailto:${email}`}>{email}</a>.
          </>
        )}
      </p>
    </LegalPage>
  );
}
