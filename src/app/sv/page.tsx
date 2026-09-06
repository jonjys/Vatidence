import type { Metadata } from "next";
import Link from "next/link";
import { FaqList } from "@/components/faq-list";
import { HomeInteractive } from "@/components/home-interactive";
import { FAQ_SV } from "@/lib/faq";
import { MINIMUM_ORDER_MINOR, TIERS, firstCountWithoutMinimum, formatMinor } from "@/lib/pricing";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "VIESProof - VIES-konsultationsnummer för redovisare",
  description:
    "Kontrollera ett EU-momsnummer gratis. Betala från 4,90 € för VIES-konsultationsnummer i PDF och CSV. För redovisare, bokförare och exportörer — inte skatterådgivning.",
  alternates: { canonical: "/sv", languages: { en: "/", sv: "/sv" } },
  openGraph: { locale: "sv_SE" },
};

export default function SwedishHomePage() {
  const floor = formatMinor(MINIMUM_ORDER_MINOR);
  const tier = formatMinor(TIERS[0]!.unitMinor);
  const clearAt = firstCountWithoutMinimum();

  return (
    <div lang="sv">
      <div className="hero">
        <h1>VIES-konsultationsnummer för redovisare, bokförare och exportörer.</h1>
        <p className="lede">
          När ni säljer utan moms inom EU kan Skatteverket — eller motsvarande i ett annat land — begära vem som
          kontrollerade kundens momsnummer, och när. VIES utfärdar den identifikatorn, ett konsultationsnummer, bara om
          ni skickar ert eget momsnummer med frågan. Den här tjänsten gör alltid det. PDF och CSV med svaren, direkt.
          Från {floor}. Den fria kontrollen är ja/nej; ni betalar bara för konsultationsnumret.
        </p>
        <p className="audience">
          För omvänd skattskyldighet, periodavstämning och exportörers kundlistor — inte för en enstaka nyfiken
          kontroll. Prova ett nummer gratis; betala bara när ni behöver konsultationsnumret, inte ett ja/nej till.
          Det här är inte skatterådgivning.
        </p>
      </div>

      <div lang="en">
        <HomeInteractive />
      </div>

      <ul className="specs">
        <li>27 medlemsländer</li>
        <li>Konsultationsnummer</li>
        <li>PDF + CSV</li>
        <li>Från {floor}</li>
        <li>Inget konto</li>
      </ul>

      <h2>Varför konsultationsnumret spelar roll</h2>
      <p>
        En kontroll på VIES webbplats utan eget momsnummer ger bara ja eller nej. Ange ert eget nummer så returnerar
        VIES ett unikt konsultationsnummer som visar vem som kontrollerade, vilket nummer och när. Den här tjänsten
        skickar alltid frågeställarens identitet, så det betalda resultatet innehåller det numret. För hand tar det
        ungefär fyrtio sekunder per nummer, plus att skriva in det i ett kalkylark.
      </p>

      <h2>Pris</h2>
      <p className="price-floor">
        Minsta order {floor}. Siffran {tier} är förstastegets styckpris; en lista med färre än {clearAt} nummer kostar
        ändå {floor}, så det effektiva priset är högre tills golvet är täckt.
      </p>
      <table>
        <thead>
          <tr>
            <th>Momsnummer</th>
            <th>Stegpris per nummer</th>
          </tr>
        </thead>
        <tbody>
          {TIERS.map((tierRow, i) => {
            const from = i === 0 ? 1 : (TIERS[i - 1]?.upTo ?? 0) + 1;
            const to = Number.isFinite(tierRow.upTo) ? String(tierRow.upTo) : "och uppåt";
            return (
              <tr key={tierRow.upTo}>
                <td>{Number.isFinite(tierRow.upTo) ? `${from} – ${to}` : `${from} och uppåt`}</td>
                <td>{formatMinor(tierRow.unitMinor)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="hint">
        En betalning, ingen återkommande avgift. Små listor kostar ändå {floor}. Rader ett medlemsland inte kan svara
        på <Link href="/refunds">återbetalas automatiskt</Link> — ni debiteras inte för ett svar ni inte fick.
      </p>

      <h2>Vad ni får</h2>
      <ul>
        <li>En PDF: en rad per momsnummer, med VIES-konsultationsnummer, tidsstämpel och registrerat namn.</li>
        <li>En CSV med samma data för bokföring eller ERP.</li>
        <li>Ett SHA-256-sigill över resultatmängden, tryckt på varje PDF-sida.</li>
      </ul>
      <p className="hint">
        Flera medlemsländer, däribland Tyskland, lämnar inget namn eller adress — bara giltighet och
        konsultationsnummer. PDF:en är skriven så att den fortfarande går att läsa i de fallen.
      </p>

      <FaqList items={FAQ_SV} title="Frågor redovisare ställer" headingId="faq-sv" lang="sv" />

      <p className="hint">
        Formuläret ovan är på engelska. <Link href="/">English homepage</Link>
      </p>
    </div>
  );
}
