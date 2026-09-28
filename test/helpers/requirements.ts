/**
 * De acht requirements van de opdrachtgever (SPEC §1) met hun toetscriterium
 * (SPEC §9). Enige bron: de testsuites halen hun titel hieruit en het
 * toetsingsrapport koppelt testresultaten via die titel aan een requirement.
 */

export type Niveau = "aangetoond" | "gedemonstreerd" | "deels buiten bereik";

export interface Requirement {
  id: RequirementId;
  titel: string;
  omschrijving: string;
  criterium: string;
  niveau: Niveau;
  beperking?: string;
}

export type RequirementId = "R1" | "R2" | "R3" | "R4" | "R5" | "R6" | "R7" | "R8";

export const NIVEAUS: Record<Niveau, string> = {
  aangetoond: "Binair te testen: de test slaagt of faalt.",
  gedemonstreerd: "Zichtbaar gemaakt, maar niet bewezen over de volle levensduur.",
  "deels buiten bereik": "Niet volledig te bewijzen zonder echte gebruikers; gemeten wat meetbaar is.",
};

export const REQUIREMENTS: readonly Requirement[] = [
  {
    id: "R1",
    titel: "Unieke identificatie en traceerbaarheid",
    omschrijving:
      "Elk materiaal krijgt een eigen ID; eigenaarschap, locatie en levenscyclusgebeurtenissen zijn volgbaar.",
    criterium: "Elke batch krijgt een uniek oplopend ID; opvragen van een onbekend ID geeft UnknownBatch.",
    niveau: "aangetoond",
  },
  {
    id: "R2",
    titel: "Gestandaardiseerde materiaal- en productdata",
    omschrijving:
      "Samenstelling, hoeveelheid, herkomst, producent, technische eigenschappen, levensduur en demontage-informatie.",
    criterium: "Alle kernvelden komen terug zoals ingevoerd; lege materiaalsoort en hoeveelheid nul worden geweigerd.",
    niveau: "aangetoond",
    beperking:
      "Getoetst zijn de kernvelden op de keten. De uitgebreide productdata staat in het paspoortdocument buiten de keten.",
  },
  {
    id: "R3",
    titel: "Circulariteits- en milieu-informatie",
    omschrijving:
      "Herbruikbaarheid, recyclebaarheid, reparatie, restwaarde, CO₂-impact en mogelijke volgende toepassingen.",
    criterium: "Uit het paspoortdocument is een circulariteitsindicatie af te leiden en te tonen.",
    niveau: "gedemonstreerd",
  },
  {
    id: "R4",
    titel: "Interoperabiliteit en open standaarden",
    omschrijving: "Uitwisseling via open standaarden en API's; interoperabel en machineleesbaar.",
    criterium: "De JSON-LD export valideert tegen het schema.",
    niveau: "gedemonstreerd",
  },
  {
    id: "R5",
    titel: "Betrouwbaarheid, herkomst en integriteit",
    omschrijving: "Vastleggen wie welke informatie wanneer heeft toegevoegd, inclusief bewijs.",
    criterium: "Een gewijzigd document laat de hashcontrole falen.",
    niveau: "aangetoond",
    beperking:
      "De hashcontrole is getoetst op documentinhoud in het geheugen; de koppeling met de documentopslag volgt nog.",
  },
  {
    id: "R6",
    titel: "Datagovernance en toegangsrechten",
    omschrijving: "Wie mag lezen, toevoegen en wijzigen. Bedrijfsgevoelige data hoeft niet publiek te zijn.",
    criterium: "Per rol: toegestane actie slaagt, verboden actie wordt geweigerd.",
    niveau: "aangetoond",
    beperking:
      "Toegangsrechten gelden voor schrijven op de keten. Documenten buiten de keten zijn in de PoC voor iedereen met de URI leesbaar.",
  },
  {
    id: "R7",
    titel: "Levenscyclus en actualiseerbaarheid",
    omschrijving:
      "Het paspoort groeit mee: productie, levering, toepassing, onderhoud, demontage, hergebruik en recycling.",
    criterium:
      "Een batch doorloopt registratie, keuring, plaatsing, splitsing, demontage en hergebruik; alle regels blijven zichtbaar.",
    niveau: "gedemonstreerd",
    beperking: "De levenscyclus 2018–2044 is gesimuleerd op een lokale keten, niet over de werkelijke levensduur.",
  },
  {
    id: "R8",
    titel: "Praktische toepasbaarheid",
    omschrijving: "Lage administratieve last, eenvoudige invoer, aansluiting op bestaande werkprocessen.",
    criterium: "Registreren kost niet meer dan een vastgesteld aantal handelingen; meet en rapporteer dat.",
    niveau: "deels buiten bereik",
    beperking: "Gebruiksgemak is zonder echte aannemers, slopers en fabrikanten niet volledig te bewijzen.",
  },
];

/** Titel van de testsuite voor een requirement, bijvoorbeeld "R1 · Unieke identificatie … [aangetoond]". */
export function suiteTitle(id: RequirementId): string {
  const requirement = REQUIREMENTS.find((r) => r.id === id)!;
  return `${requirement.id} · ${requirement.titel} [${requirement.niveau}]`;
}
