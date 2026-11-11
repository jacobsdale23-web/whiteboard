import { CONTACT_EMAIL } from "@/lib/contact";

// A support line next to the QuickBooks controls. Errors from QuickBooks end with "(Intuit ref: ...)"; quoting it lets Intuit find the call.
export default function QbHelp() {
  return (
    <p style={{ fontSize: "0.72rem", color: "var(--muted)", marginTop: 8 }}>
      Problem or question with QuickBooks? Email{" "}
      <a href={`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent("White Board / QuickBooks")}`} style={{ color: "inherit", textDecoration: "underline" }}>
        {CONTACT_EMAIL}
      </a>{" "}
      and include the &ldquo;Intuit ref&rdquo; number if the message shows one.
    </p>
  );
}
