/**
 * Who operates this product, and where to write about what.
 *
 * Deliberately hard-coded rather than read from the environment.
 * Only public identity lives here: trading name, country, and tax status in words.
 */

export const CONTACT = {
  product: "Vatidence",
  productUrl: "https://vatidence.nyttolabs.com",

  operator: "Nytto Labs",
  operatorUrl: "https://nyttolabs.com",
  country: "Sweden",
  legalForm: "Swedish sole trader",

  email: {
    general: "hello@nyttolabs.com",
    support: "support@nyttolabs.com",
    privacy: "privacy@nyttolabs.com",
    billing: "billing@nyttolabs.com",
  },
} as const;

export const OPERATOR_LINE = `${CONTACT.operator}, ${CONTACT.country}`;

export const OPERATOR_IDENTITY = `${CONTACT.operator}, ${CONTACT.country}`;

export const OPERATOR_TAX_STATUS = "Approved for F-tax. VAT-registered.";
