/**
 * De documenten van de demo-casus (SPEC §10): stalen liggers uit een
 * donorgebouw in Heerlen. Inhoud is fictief maar realistisch genoeg voor een demo.
 */
import { pdf } from "./pdf.js";

export interface DemoDocument {
  name: string;
  type: string;
  bytes: Uint8Array;
}

const text = (value: string) => new Uint8Array(Buffer.from(value, "utf8"));

/** Paspoortdocument als JSON-LD, met de elf datacategorieën uit SPEC §3.2. */
export function paspoort(batch: {
  materialType: string;
  quantity: number;
  unit: string;
  origin: string;
  productionDate: string;
}): DemoDocument {
  const document = {
    "@context": { "@vocab": "https://cel4life.example/bbm-paspoort#" },
    "@type": "Materiaalpaspoort",
    identificatie: { materiaalsoort: batch.materialType, norm: "EN 10025-2", profiel: "HEA 200" },
    fysiekeEigenschappen: { lengte_m: 6.0, massaPerMeter_kg: 42.3, hoeveelheid: batch.quantity, eenheid: batch.unit },
    samenstelling: { staalsoort: "S355J2", gerecycledAandeel_pct: 72 },
    herkomstEnProductie: { producent: batch.origin, productiedatum: batch.productionDate, land: "NL" },
    technischePrestaties: { vloeigrens_MPa: 355, treksterkte_MPa: 510, brandwerendheid: "R30 met coating" },
    milieuImpact: { co2_kgPerTon: 1150, epd: "EPD-staal-2017-042" },
    circulariteit: {
      herbruikbaar: true,
      recyclebaar: true,
      verwachteLevensduur_jaar: 100,
      volgendeToepassingen: ["draagconstructie", "hulpconstructie", "recycling tot nieuw staal"],
    },
    losmaakbaarheid: { verbinding: "gebout", demontabel: true, toelichting: "Kopplaatverbindingen M20, niet gelast" },
    onderhoudshistorie: [],
    eigendom: { eersteEigenaar: batch.origin },
    certificering: ["CE-markering EN 1090-1", "KOMO productcertificaat"],
  };
  return {
    name: "paspoort-hea200-batch-1.jsonld",
    type: "application/ld+json",
    bytes: text(JSON.stringify(document, null, 2)),
  };
}

export const bouwtekening: DemoDocument = {
  name: "bouwtekening-kantoor-heerlen.pdf",
  type: "application/pdf",
  bytes: pdf("Bouwtekening D-201: draagconstructie kantoorgebouw", [
    "Project: kantoorgebouw Akerstraat, Heerlen",
    "Onderdeel: stalen liggers verdieping 1 t/m 4",
    "",
    "Profiel: HEA 200, staal S355, lengte 6,0 m",
    "Aantal: 200 stuks, verdeeld over stramien A-H",
    "Verbindingen: kopplaten, bouten M20 klasse 8.8 (demontabel)",
    "",
    "Opgesteld door: Bouwbedrijf Heerlen, september 2018",
  ]),
};

export const conditierapport: DemoDocument = {
  name: "conditierapport-demontage-2044.pdf",
  type: "application/pdf",
  bytes: pdf("Conditierapport demontage", [
    "Object: kantoorgebouw Akerstraat, Heerlen",
    "Materiaal: 200 stalen liggers HEA 200, S355",
    "Datum demontage: maart 2044",
    "",
    "Bevindingen:",
    "- Geen zichtbare vervorming of scheurvorming",
    "- Oppervlakkige corrosie op 12 liggers, niet constructief",
    "- Alle boutverbindingen zonder schade losgenomen",
    "",
    "Conclusie: geschikt voor hergebruik na herkeuring",
    "Opgesteld door: Sloopbedrijf Parkstad",
  ]),
};

export const foto: DemoDocument = {
  name: "foto-gedemonteerde-liggers.svg",
  type: "image/svg+xml",
  bytes: text(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 240" role="img" aria-label="Gestapelde stalen liggers">
  <rect width="400" height="240" fill="#e8ece9"/>
  ${Array.from({ length: 6 }, (_, i) => `<rect x="30" y="${40 + i * 30}" width="340" height="18" rx="2" fill="#5b6770"/>`).join("\n  ")}
  <text x="200" y="228" text-anchor="middle" font-family="sans-serif" font-size="13" fill="#1d2521">Gedemonteerde liggers, opslag Parkstad, maart 2044</text>
</svg>`),
};

/** Bevat bewust "85%": het vervalsscript maakt daar "95%" van. */
export const herkeuring: DemoDocument = {
  name: "herkeuring-restcapaciteit-2044.pdf",
  type: "application/pdf",
  bytes: pdf("Keuringsrapport K-2044-0173", [
    "Materiaal: stalen liggers HEA 200, S355 (batch 1)",
    "Herkomst: donorgebouw Akerstraat, Heerlen",
    "",
    "Onderzoek: steekproef 20 liggers, hardheidsmeting en maatcontrole",
    "Restcapaciteit: 85% van de oorspronkelijke draagcapaciteit",
    "",
    "Oordeel: geschikt voor hergebruik als draagconstructie",
    "Keuringsinstituut Limburg, april 2044",
  ]),
};

export const kanaalplaatPlaatsing: DemoDocument = {
  name: "opleverdossier-vloeren-2019.pdf",
  type: "application/pdf",
  bytes: pdf("Opleverdossier vloeren", [
    "Project: kantoorgebouw Akerstraat, Heerlen",
    "Onderdeel: kanaalplaatvloeren verdieping 1 t/m 4",
    "Aantal: 40 platen, beton C45/55, oplegging op HEA 200",
    "Oplevering: februari 2019",
  ]),
};
