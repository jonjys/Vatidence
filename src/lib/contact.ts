/**
 * Who operates this product, and where to write about what.
 *
 * Deliberately hard-coded rather than read from the environment. These used to
 * come from LEGAL_ENTITY and SUPPORT_EMAIL, and production had SUPPORT_EMAIL
 * set to the owner's personal Gmail address - which the privacy, terms and
 * refunds pages then published to the open web. An identity that appears in
 * legal text should be reviewable in a diff, not silently changeable in a
 * dashboard.
 *
 * Only public identity lives here: trading name, the person who operates it,
 * country, and tax status in words. No organisation number, VAT number,
 * personnummer or street address - none of those belong on a public page.
 */

export const CONTACT = {
  /** The product. */
  product: "VIESProof",
  productUrl: "https://viesproof.eu",

  /** The legal operator behind it. */
  operator: "Nytto Labs",
  operatorUrl: "https://nyttolabs.com",
  country: "Sweden",
  /** The natural person who operates the trading name. */
  operatedBy: "Fredrik Kornelind",
  /** Swedish legal form, in the language the site is written in. */
  legalForm: "Swedish sole trader",

  /**
   * One inbox per kind of question, so a customer never has to guess and a
   * GDPR request never lands in a billing thread.
   */
  email: {
    /** Anything that is not one of the below. */
    general: "hello@nyttolabs.com",
    /** An order that misbehaved; the product not doing what it should. */
    support: "support@nyttolabs.com",
    /** Access, erasure, and every other data-protection request. */
    privacy: "privacy@nyttolabs.com",
    /** Payments, refunds, invoices, receipts. */
    billing: "billing@nyttolabs.com",
  },
} as const;

/** Compact operator identifier for short mentions and metadata. */
export const OPERATOR_LINE = `${CONTACT.operator}, ${CONTACT.country}`;

/** Trading name plus the person who operates it, for legal pages and the PDF. */
export const OPERATOR_IDENTITY = `${CONTACT.operator}, operated by ${CONTACT.operatedBy}, ${CONTACT.country}`;

/** Public Swedish tax status. No registration numbers. */
export const OPERATOR_TAX_STATUS = "Approved for F-tax. VAT-registered.";
