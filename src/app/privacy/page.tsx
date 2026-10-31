import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";
import { LEGAL_UPDATED, operator } from "@/lib/legal";

export const metadata: Metadata = { title: "Privacy | GEO Score" };

export default function PrivacyPage() {
  const { name, email } = operator();
  return (
    <LegalPage title="Privacy" updated={LEGAL_UPDATED}>
      <p>
        GEO Score is run by {name}, the controller of the personal data described here. We collect as little as the service needs and never
        sell it.
      </p>

      <h2>What we collect and why</h2>
      <ul>
        <li>
          <strong>Websites you check</strong> and the analysis results. Reports are public to anyone with the link and contain no personal data.
        </li>
        <li>
          <strong>Your IP address</strong>, only as a salted one-way hash, to limit free checks and sign-in emails and stop abuse.
        </li>
        <li>
          <strong>Your email address</strong>, if you create an account: to sign you in, to send the weekly score you pay for, and for
          billing.
        </li>
        <li>
          <strong>Billing details</strong> are handled by Stripe. We only keep your Stripe customer id and subscription status; we never see your
          card.
        </li>
      </ul>

      <h2>Legal basis</h2>
      <p>
        Performing our contract with you (account, weekly emails, billing), our legitimate interest in preventing abuse (hashed IPs, bot checks),
        and legal obligations (invoices).
      </p>

      <h2>Who processes it for us</h2>
      <ul>
        <li>Cloudflare: hosting, database, AI models, bot protection (Turnstile) and email sending.</li>
        <li>Stripe: payments and invoices.</li>
      </ul>
      <p>The AI models are only sent public information about websites, never your email or payment details.</p>

      <h2>Cookies</h2>
      <p>One strictly necessary cookie keeps you signed in. Turnstile may set its own to check you&apos;re human. No analytics or advertising cookies.</p>

      <h2>How long we keep it</h2>
      <p>
        Account data: until you delete your account. Sign-in links: 24 hours. Sessions: 30 days. Invoices: as long as tax law requires (kept by
        Stripe).
      </p>

      <h2>Your rights</h2>
      <p>
        You can access, correct, export or erase your data, object to its processing, and complain to your data protection authority. Delete your
        account anytime from the Account page; it erases your data and cancels billing at once.
        {email && (
          <>
            {" "}
            For anything else, write to <a href={`mailto:${email}`}>{email}</a>.
          </>
        )}
      </p>
    </LegalPage>
  );
}
