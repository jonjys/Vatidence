import type { Metadata } from "next";
import Link from "next/link";
import { SharedCheck } from "@/components/shared-check";
import { COUNTRIES } from "@/lib/countries";
import { parseVat } from "@/lib/vat";

/**
 * A link someone can paste into an email or a chat: "is this customer
 * registered?". Opening it runs a fresh check against VIES in the visitor's
 * browser, exactly like the homepage. Nothing is stored or cached, so the page
 * never republishes an old answer - and it is kept out of search indexes and
 * robots.txt, because every open costs the Commission a lookup.
 */

type Props = { params: Promise<{ vat: string }> };

function read(raw: string) {
  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    // a malformed escape is just an invalid number
  }
  return { raw: decoded.slice(0, 40), parsed: parseVat(decoded) };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { raw, parsed } = read((await params).vat);
  const label = parsed.ok ? parsed.value.canonical : raw;
  return {
    title: `Is ${label} a valid EU VAT number?`,
    description: `A live VIES check of ${label}, run fresh each time this link is opened.`,
    robots: { index: false, follow: true },
  };
}

export default async function CheckPage({ params }: Props) {
  const { raw, parsed } = read((await params).vat);
  const country = parsed.ok ? COUNTRIES[parsed.value.countryCode] : null;
  const label = parsed.ok ? parsed.value.canonical : raw;

  return (
    <div className="page page-check">
      <p className="kicker">Shared VAT check{country ? ` · ${country.name}` : ""}</p>
      <h1>Is {label} a valid EU VAT number?</h1>
      <p className="lede">
        This link asks the European Commission&apos;s VIES service again every time it is opened, so the answer below is
        current, not a copy. Nothing about it is stored.
      </p>

      <SharedCheck vatNumber={parsed.ok ? parsed.value.canonical : raw} autoRun={parsed.ok} />

      <h2>Need this as evidence?</h2>
      <p>
        A free check is a yes or no. For a record of who checked, which number and when, VIES issues a consultation
        number to a requester who identifies with their own VAT number. Vatidence does that for a whole customer list at
        once and returns every consultation number in a sealed PDF and CSV.
      </p>
      <p>
        <Link href="/#order" className="btn">
          Verify a list <span className="arrow" aria-hidden="true">→</span>
        </Link>
      </p>
    </div>
  );
}
