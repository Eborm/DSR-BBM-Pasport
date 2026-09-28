/**
 * Rolt het contract uit op de lokale demoketen en zet de casus uit SPEC §10
 * erop: stalen liggers uit een donorgebouw in Heerlen, van registratie in 2018
 * tot splitsing in 2044. Schrijft app/public/deployment.json voor de app en
 * een kopie van elk document naar demo/documenten/ voor het verificatiescherm.
 *
 *   hardhat run scripts/demo-data.ts --network localhost
 *
 * Verwacht een draaiende keten (`hardhat node --network demo`) en documentopslag.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { network } from "hardhat";
import {
  bouwtekening,
  conditierapport,
  foto,
  herkeuring,
  kanaalplaatPlaatsing,
  paspoort,
  type DemoDocument,
} from "./demo/documenten.js";
import { DEMO_DOCUMENTEN, DEPLOYMENT_FILE, STORAGE_URL, type Deployment } from "./demo/deployment.js";

const { ethers, networkHelpers } = await network.create();

const [beheerder, staalfabriek, aannemer, keurder, sloper, architect, betonfabriek, gemeente] =
  await ethers.getSigners();

const ACCOUNTS = [
  { signer: beheerder, name: "Beheerder", toelichting: "Kent rollen toe; handelt zelf niet" },
  { signer: staalfabriek, name: "Staalfabriek Zuid-Limburg", toelichting: "Fabrikant" },
  { signer: betonfabriek, name: "Betonfabriek De Maas", toelichting: "Fabrikant" },
  { signer: aannemer, name: "Bouwbedrijf Heerlen", toelichting: "Eigenaar (aannemer)" },
  { signer: architect, name: "Architectenbureau Maastricht", toelichting: "Eigenaar (hergebruiker)" },
  { signer: keurder, name: "Keuringsinstituut Limburg", toelichting: "Keurder" },
  { signer: sloper, name: "Sloopbedrijf Parkstad", toelichting: "Sloper" },
  { signer: gemeente, name: "Gemeente Heerlen", toelichting: "Geen rol: alleen lezen" },
];

// ------------------------------------------------------------------ Hulpjes

const seconds = (iso: string) => Math.floor(Date.parse(iso) / 1000);
const op = (iso: string) => networkHelpers.time.setNextBlockTimestamp(seconds(iso));

async function opslaan(document: DemoDocument) {
  const response = await fetch(`${STORAGE_URL}/documents`, {
    method: "POST",
    headers: { "content-type": document.type, "x-filename": encodeURIComponent(document.name) },
    body: document.bytes,
  });
  if (!response.ok) throw new Error(`Opslaan van ${document.name} mislukt: ${response.status}`);
  const { uri } = (await response.json()) as { uri: string };
  await writeFile(path.join(DEMO_DOCUMENTEN, document.name), document.bytes);
  return { uri, hash: ethers.keccak256(document.bytes) };
}

const kind = (name: string) => ethers.keccak256(ethers.toUtf8Bytes(name));
const Level = { RawMaterial: 0, Product: 1, Component: 2, BuildingElement: 3 };

// ----------------------------------------------------------------- Uitrollen

try {
  await fetch(`${STORAGE_URL}/documents/controle`);
} catch {
  throw new Error(`Documentopslag niet bereikbaar op ${STORAGE_URL}. Start eerst: npm run storage`);
}
await mkdir(DEMO_DOCUMENTEN, { recursive: true });

const passport = await ethers.deployContract("MaterialPassport", [beheerder.address]);
const deployBlock = (await passport.deploymentTransaction()!.wait())!.blockNumber;

for (const [signer, role] of [
  [staalfabriek, "MANUFACTURER"],
  [betonfabriek, "MANUFACTURER"],
  [aannemer, "OWNER"],
  [architect, "OWNER"],
  [keurder, "INSPECTOR"],
  [sloper, "DEMOLISHER"],
] as const) {
  await passport.grantRole(ethers.keccak256(ethers.toUtf8Bytes(role)), signer.address);
}

// ------------------------------------------------------------------ Casus

// 1. Fabrikant registreert 200 stalen liggers HEA 200, S355.
const paspoortDoc = await opslaan(
  paspoort({
    materialType: "Staal S355, HEA 200",
    quantity: 200,
    unit: "stuks",
    origin: "Staalfabriek Zuid-Limburg",
    productionDate: "2018-02-15",
  }),
);
await op("2018-03-12T10:15:00Z");
await passport.connect(staalfabriek).registerBatch({
  materialType: "Staal S355, HEA 200",
  quantity: 200n,
  unit: "stuks",
  level: Level.BuildingElement,
  origin: "Staalfabriek Zuid-Limburg",
  productionDate: BigInt(seconds("2018-02-15T00:00:00Z")),
  metadataURI: paspoortDoc.uri,
  metadataHash: paspoortDoc.hash,
});

await op("2018-04-03T08:30:00Z");
await passport.connect(staalfabriek).transferOwnership(1n, aannemer.address, 200n);

// 2. Aannemer claimt plaatsing in een kantoorgebouw, met bouwtekening.
const tekening = await opslaan(bouwtekening);
await op("2018-09-20T14:00:00Z");
await passport
  .connect(aannemer)
  .addClaim(1n, kind("placement"), tekening.hash, tekening.uri, "Geplaatst in kantoorgebouw Akerstraat, Heerlen");

// Tweede batch in hetzelfde gebouw, zodat zoeken en filteren iets te doen hebben.
await op("2019-01-14T09:00:00Z");
await passport.connect(betonfabriek).registerBatch({
  materialType: "Kanaalplaatvloer beton C45/55",
  quantity: 40n,
  unit: "stuks",
  level: Level.Component,
  origin: "Betonfabriek De Maas",
  productionDate: BigInt(seconds("2018-12-03T00:00:00Z")),
  metadataURI: "",
  metadataHash: ethers.ZeroHash,
});
await op("2019-01-21T09:00:00Z");
await passport.connect(betonfabriek).transferOwnership(2n, aannemer.address, 40n);
const vloeren = await opslaan(kanaalplaatPlaatsing);
await op("2019-02-18T11:00:00Z");
await passport
  .connect(aannemer)
  .addClaim(2n, kind("placement"), vloeren.hash, vloeren.uri, "Geplaatst als verdiepingsvloer, kantoorgebouw Heerlen");

// Derde batch: nieuw staal op voorraad, nog nergens toegepast.
await op("2043-11-06T13:00:00Z");
await passport.connect(staalfabriek).registerBatch({
  materialType: "Staal S235, IPE 160",
  quantity: 80n,
  unit: "stuks",
  level: Level.Product,
  origin: "Staalfabriek Zuid-Limburg",
  productionDate: BigInt(seconds("2043-10-20T00:00:00Z")),
  metadataURI: "",
  metadataHash: ethers.ZeroHash,
});

// 3. 2044: sloper claimt demontage met een conditierapport en foto's.
const rapport = await opslaan(conditierapport);
await op("2044-03-04T07:45:00Z");
await passport
  .connect(sloper)
  .addClaim(1n, kind("demolition"), rapport.hash, rapport.uri, "Gedemonteerd, goede staat; beschikbaar voor hergebruik");
const fotoDoc = await opslaan(foto);
await op("2044-03-05T16:20:00Z");
await passport
  .connect(sloper)
  .addClaim(1n, kind("demolition"), fotoDoc.hash, fotoDoc.uri, "Foto's van de gedemonteerde liggers in opslag");

// 4. Keuringsinstantie voegt een herkeuring toe met 85% restcapaciteit.
const keuring = await opslaan(herkeuring);
await op("2044-04-10T10:00:00Z");
await passport
  .connect(keurder)
  .addClaim(1n, kind("inspection"), keuring.hash, keuring.uri, "Herkeuring: restcapaciteit 85%");

// 5. Batch wordt gesplitst: 50 liggers gaan naar een ander project.
await op("2044-05-02T09:30:00Z");
await passport.connect(aannemer).splitBatch(1n, 50n, architect.address);

// ------------------------------------------------------------------ Uitvoer

const deployment: Deployment = {
  chainId: Number((await ethers.provider.getNetwork()).chainId),
  rpcUrl: "http://127.0.0.1:8545",
  storageUrl: STORAGE_URL,
  address: await passport.getAddress(),
  deployBlock,
  accounts: ACCOUNTS.map(({ signer, name, toelichting }) => ({ name, address: signer.address, toelichting })),
};
await mkdir(path.dirname(DEPLOYMENT_FILE), { recursive: true });
await writeFile(DEPLOYMENT_FILE, JSON.stringify(deployment, null, 2));

console.log(`MaterialPassport op ${deployment.address}`);
console.log(`${await passport.batchCount()} batches, documenten in ${path.relative(process.cwd(), DEMO_DOCUMENTEN)}`);
