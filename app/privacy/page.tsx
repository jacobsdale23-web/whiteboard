import type { Metadata } from "next";
import { CONTACT_EMAIL, LegalPage, Section } from "../legal-page";

export const metadata: Metadata = { title: "Privacy policy · White Board" };

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy policy" updated="November 2, 2026">
      <Section title="Who we are">
        <p>
          White Board is a private, internal scheduling, estimating and billing tool run by Feliciana Welders and its affiliated
          companies (Feliciana Welders, O&amp;M, PIP and P-Group). It is used only by our own employees and is not offered to the
          public or to other businesses.
        </p>
      </Section>
      <Section title="What we collect">
        <p>
          Employee account details (name, work email, role), job and project records, daily logs, time and billing records,
          estimates and quotes, and files our staff upload for our own jobs.
        </p>
      </Section>
      <Section title="QuickBooks">
        <p>
          An administrator can connect White Board to our company&apos;s own QuickBooks Online account. When connected, White Board
          reads our quotes (estimates), invoices and customer names, and creates invoices and attaches job paperwork to them in
          our QuickBooks file so billing does not have to be retyped.
        </p>
        <p>
          White Board never emails or sends an invoice from QuickBooks. It only saves invoices; our staff download and send them
          by hand. The connection tokens are stored encrypted, are used only for our own QuickBooks file, and can be disconnected
          by an administrator at any time (which deletes them). QuickBooks data is shown only to administrators.
        </p>
      </Section>
      <Section title="How we use and share information">
        <p>
          We use information only to run our own jobs: scheduling crews, estimating, daily logs, billing and payroll support. We do
          not sell personal or financial information, and we do not share it for advertising. It is shared only with the service
          providers that host the tool (cloud hosting and database providers) and with Intuit when QuickBooks is connected.
        </p>
      </Section>
      <Section title="Security and retention">
        <p>
          Access requires a sign-in, data is encrypted in transit, and access is limited by role. We keep records for as long as
          needed for our business, tax and contract obligations, then delete them.
        </p>
      </Section>
      <Section title="Your choices and contact">
        <p>
          Employees can ask us to correct or delete their account information. Questions about this policy:{" "}
          <a href={`mailto:${CONTACT_EMAIL}`} style={{ textDecoration: "underline" }}>{CONTACT_EMAIL}</a>.
        </p>
      </Section>
    </LegalPage>
  );
}
