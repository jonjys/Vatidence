import type { Metadata } from "next";
import { CONTACT, OPERATOR_LINE, OPERATOR_TAX_STATUS } from "@/lib/contact";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Contact",
  description: `How to reach ${OPERATOR_LINE}, the operator of ${CONTACT.product}.`,
  alternates: { canonical: "/contact" },
};

/**
 * One inbox per kind of question. A customer should never have to guess, and a
 * data-protection request should never arrive in a billing thread.
 */
const ROUTES = [
  {
    what: "An order that misbehaved",
    detail: "A row that came back wrong, a download that will not open, anything the automation got wrong.",
    email: CONTACT.email.support,
  },
  {
    what: "Payments, refunds and invoices",
    detail: "A charge you do not recognise, a receipt you need, a refund the automatic path did not cover.",
    email: CONTACT.email.billing,
  },
  {
    what: "Data protection",
    detail: "Access, erasure, or anything else under the GDPR. Include the order URL and it can be acted on directly.",
    email: CONTACT.email.privacy,
  },
  {
    what: "Anything else",
    detail: "Questions about the service, the evidence pack, or working together.",
    email: CONTACT.email.general,
  },
] as const;

export default function ContactPage() {
  return (
    <>
      <h1>Contact</h1>
      <p className="lede">
        {CONTACT.product} is operated by {OPERATOR_LINE}. There is no support queue and no ticket form — these go to a
        person.
      </p>

      {ROUTES.map((route) => (
        <div className="panel" key={route.email}>
          <p className="card-title">{route.what}</p>
          <p className="card-sub">{route.detail}</p>
          <a className="dl" href={`mailto:${route.email}`}>
            {route.email}
          </a>
        </div>
      ))}

      <h2>Operator</h2>
      <p>
        {CONTACT.operator} — <a href={CONTACT.operatorUrl}>nyttolabs.com</a>
        <br />
        Operated by {CONTACT.operatedBy}
        <br />
        {CONTACT.country}
        <br />
        {OPERATOR_TAX_STATUS}
      </p>
      <p className="hint">
        Include the order URL whenever you have one. It is the only thing that identifies an order, and it lets a
        question be answered without any further back and forth.
      </p>
    </>
  );
}
