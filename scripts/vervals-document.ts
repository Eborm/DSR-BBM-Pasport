/**
 * Vervalst bewust één document in de opslag (SPEC §10): in het keuringsrapport
 * van batch 1 wordt "85%" vervangen door "95%". Eén byte verschil. De hash op de
 * keten verandert niet, dus de app toont bij dat document een rode melding.
 *
 *   npm run demo:vervals
 *
 * Nabootsing van iemand met schrijftoegang tot de documentopslag, niet tot de keten.
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { network } from "hardhat";
import { DEPLOYMENT_FILE, type Deployment } from "./demo/deployment.js";

const STORAGE_FOLDER = path.resolve(process.env.STORAGE_FOLDER ?? "storage/data");

const deployment = JSON.parse(await readFile(DEPLOYMENT_FILE, "utf8")) as Deployment;
const { ethers } = await network.create();
const passport = await ethers.getContractAt("MaterialPassport", deployment.address);

const inspections = await passport.queryFilter(
  passport.filters.TimelineEvent(1n, ethers.keccak256(ethers.toUtf8Bytes("inspection"))),
  deployment.deployBlock,
);
if (inspections.length === 0) throw new Error("Geen keuring gevonden op batch 1. Is de demo gestart?");

const { documentURI, documentHash } = inspections[0].args;
const file = path.join(STORAGE_FOLDER, documentURI.split("/").pop()!);
const bytes = await readFile(file);

const origineel = Buffer.from("85%", "latin1");
const vervalst = Buffer.from("95%", "latin1");
const positie = bytes.indexOf(origineel);
// Geen process.exit(): op Windows crasht Node dan op de nog open verbinding met de keten.
if (positie === -1) {
  console.log(bytes.includes(vervalst) ? "Dit document is al vervalst." : "Tekst \"85%\" niet gevonden in het document.");
} else {
  vervalst.copy(bytes, positie);
  await writeFile(file, bytes);

  console.log(`Vervalst: ${documentURI}`);
  console.log(`  "85%" → "95%" op byte ${positie}`);
  console.log(`  hash op de keten:  ${documentHash}`);
  console.log(`  hash van nu:       ${ethers.keccak256(bytes)}`);
  console.log("Open batch 1 in de app: het keuringsrapport krijgt een rode melding.");
}
