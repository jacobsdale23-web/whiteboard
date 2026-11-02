import type { Metadata } from "next";
import { CONTACT_EMAIL, LegalPage, Section } from "../legal-page";

export const metadata: Metadata = { title: "Terms of use · White Board" };

export default function TermsPage() {
  return (
    <LegalPage title="End-user license agreement and terms of use" updated="November 2, 2026">
      <Section title="Who may use White Board">
        <p>
          White Board is a private internal tool of Feliciana Welders and its affiliated companies. It is licensed only to our
          employees and authorized personnel for our own business. Access is by account we create. It is not offered to the
          public.
        </p>
      </Section>
      <Section title="Acceptable use">
        <p>
          Use White Board only for company work. Keep your sign-in private, do not share or copy company data outside the company,
          and do not attempt to bypass access limits. We may suspend or remove access at any time.
        </p>
      </Section>
      <Section title="QuickBooks connection">
        <p>
          Only administrators can connect White Board to our company&apos;s QuickBooks Online account, and only to our own file.
          Invoices created from White Board are saved in QuickBooks for review; they are not emailed or sent automatically.
          Whoever bills a job is responsible for checking an invoice in QuickBooks before sending it. The connection can be
          removed at any time.
        </p>
      </Section>
      <Section title="Ownership">
        <p>
          The software and the company data in it belong to Feliciana Welders. You receive a limited, non-transferable right to use
          the tool while you work with us.
        </p>
      </Section>
      <Section title="No warranty and liability">
        <p>
          White Board is provided as is, without warranties. Estimates, quantities and billing totals it produces must be checked
          by the responsible person before use. To the extent the law allows, we are not liable for indirect or consequential
          losses from its use.
        </p>
      </Section>
      <Section title="Contact">
        <p>
          Questions about these terms:{" "}
          <a href={`mailto:${CONTACT_EMAIL}`} style={{ textDecoration: "underline" }}>{CONTACT_EMAIL}</a>.
        </p>
      </Section>
    </LegalPage>
  );
}
