/**
 * Public FAQ copy. Kept in one module so the page, the Swedish page, JSON-LD
 * and the honesty tests cannot drift apart.
 *
 * Claims stay inside what VIES actually does: a consultation number is issued
 * when the requester identifies itself; "not valid" is an answer; unanswered
 * rows are refunded. Honesty tests in tests/contact.test.ts forbid the phrases
 * we do not have standing to publish.
 */

export type FaqItem = { q: string; a: string };

export const FAQ_EN: readonly FaqItem[] = [
  {
    q: "Who is this for?",
    a: "Accountants, bookkeepers and exporters who zero-rate intra-EU invoices (reverse charge) and need a VIES consultation number on file for each customer VAT they checked. Finance teams and SaaS billing operators who verify a list rather than one number at a time use it the same way.",
  },
  {
    q: "What is a VIES consultation number, and why does it matter?",
    a: "When you check a VAT number on VIES and identify yourself with your own VAT number, VIES returns a unique consultation number that records who checked, which number, and when. A tax authority can ask for that identifier if a 0% intra-EU invoice is later challenged. A yes/no without it is not something you can file.",
  },
  {
    q: "Why do I have to enter my own EU VAT number?",
    a: "VIES issues a consultation number only when the requester identifies itself. The free check on this page sends no requester, so it genuinely has none. The paid check always sends yours. Without it you would be paying for the same yes/no the free check already gave you.",
  },
  {
    q: "What is the minimum order?",
    a: "€4.90, even for a single number. The published €0.39 rate is the first-tier price; a batch smaller than 13 numbers still pays the floor, so the effective rate is higher until that floor is covered. One payment, no subscription.",
  },
  {
    q: "What if a VAT number is not valid?",
    a: "That is an answer, and an answer is what you paid for. Invalid numbers are billed. Rows that are not usable as EU VAT numbers are rejected before payment and never charged.",
  },
  {
    q: "What if a member state cannot answer?",
    a: "Those rows are retried automatically. If they stay unanswerable — typically because that country's VIES node is offline — their share of the payment is refunded to the original card, including any minimum-order component. You are never billed for a row that produced no answer.",
  },
  {
    q: "Do I need an account?",
    a: "No. Paste a list, pay once, keep the order URL. That URL is how you reach the PDF and CSV again. Results stay retrievable for 90 days, then the identifying data is erased.",
  },
  {
    q: "Who operates this?",
    a: "Nytto Labs, a Swedish sole trader operated by Fredrik Kornelind. Approved for F-tax. VAT-registered. Sold as a one-off verification, not tax, legal or accounting advice — VIES answers are relayed as the European Commission returns them.",
  },
] as const;

export const FAQ_SV: readonly FaqItem[] = [
  {
    q: "Vem är det här för?",
    a: "Redovisningskonsulter, bokförare och exportörer som säljer utan moms inom EU (omvänd skattskyldighet) och behöver ett VIES-konsultationsnummer sparat för varje kundmomsnummer de kontrollerat. Samma sak för ekonomiavdelningar och SaaS-fakturering som tar en lista i taget.",
  },
  {
    q: "Vad är ett VIES-konsultationsnummer, och varför spelar det roll?",
    a: "När du kontrollerar ett momsnummer i VIES och identifierar dig med ditt eget momsnummer returnerar VIES ett unikt konsultationsnummer som visar vem som kontrollerade, vilket nummer och när. En skattemyndighet kan begära den identifikatorn om en 0 %-faktura inom EU ifrågasätts senare. Ett ja/nej utan den går inte att lägga i akten.",
  },
  {
    q: "Varför måste jag ange mitt eget EU-momsnummer?",
    a: "VIES utfärdar ett konsultationsnummer bara när den som frågar identifierar sig. Den fria kontrollen på den här sidan skickar ingen frågeställare, och har därför inget nummer. Den betalda kontrollen skickar alltid ditt. Utan det skulle du betala för samma ja/nej som den fria kontrollen redan gav.",
  },
  {
    q: "Vad är minsta order?",
    a: "4,90 €, även för ett enda nummer. Publicerat styckpris 0,39 € är förstasteget; en lista med färre än 13 nummer kostar ändå golvet, så det effektiva priset är högre tills golvet är täckt. En betalning, ingen prenumeration.",
  },
  {
    q: "Vad händer om ett momsnummer inte är giltigt?",
    a: "Det är ett svar, och ett svar är det du betalat för. Ogiltiga nummer debiteras. Rader som inte går att läsa som EU-momsnummer stoppas före betalning och debiteras inte.",
  },
  {
    q: "Vad händer om ett medlemsland inte kan svara?",
    a: "De raderna görs om automatiskt. Om de förblir obesvarade — oftast för att landets VIES-nod är nere — återbetalas den andelen till samma kort, inklusive eventuell minimiorder. Du debiteras inte för en rad utan svar.",
  },
  {
    q: "Behöver jag ett konto?",
    a: "Nej. Klistra in en lista, betala en gång, spara orderlänken. Den länken är enda vägen tillbaka till PDF och CSV. Resultaten går att hämta i 90 dagar; därefter raderas identifierande uppgifter.",
  },
  {
    q: "Vem driver tjänsten?",
    a: "Nytto Labs, en svensk enskild näringsidkare driven av Fredrik Kornelind. Godkänd för F-skatt. Momsregistrerad. En engångskontroll, inte skatterådgivning, juridik eller redovisningsråd — VIES-svaren vidarebefordras som Europeiska kommissionen lämnar dem.",
  },
] as const;

export function faqJsonLd(items: readonly FaqItem[]): string {
  const payload = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: { "@type": "Answer", text: item.a },
    })),
  };
  // Prevent a stray "</script>" in copy from breaking the page.
  return JSON.stringify(payload).replace(/</g, "\\u003c");
}
