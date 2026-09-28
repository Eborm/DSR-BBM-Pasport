import { keccak256, toUtf8Bytes, ZeroHash } from "ethers";
import type { network } from "hardhat";
import type { MaterialPassport } from "../../types/ethers-contracts/index.js";

type Ethers = Awaited<ReturnType<typeof network.create>>["ethers"];

export const Level = { RawMaterial: 0, Product: 1, Component: 2, BuildingElement: 3 } as const;

/** De `kind` van een tijdlijnregel: keccak256 van de soortnaam. */
export const kind = (name: string) => keccak256(toUtf8Bytes(name));

/** Invoer voor `registerBatch`, standaard de stalen liggers uit de demo-casus. */
export function batchInput(overrides: Partial<MaterialPassport.BatchInputStruct> = {}) {
  return {
    materialType: "staal S355, HEA 200",
    quantity: 200n,
    unit: "stuks",
    level: Level.BuildingElement,
    origin: "Staalfabriek Zuid-Limburg",
    productionDate: 1514764800n, // 1 januari 2018
    metadataURI: "",
    metadataHash: ZeroHash,
    ...overrides,
  };
}

/** Rolt het contract uit en geeft elke rol uit de specificatie een eigen adres. */
export async function deployPassport(ethers: Ethers) {
  const [admin, fabrikant, aannemer, keurder, sloper, architect, buitenstaander, tweedeKeurder] =
    await ethers.getSigners();

  const passport = await ethers.deployContract("MaterialPassport", [admin.address]);
  await passport.grantRole(await passport.MANUFACTURER(), fabrikant.address);
  await passport.grantRole(await passport.OWNER(), aannemer.address);
  await passport.grantRole(await passport.OWNER(), architect.address);
  await passport.grantRole(await passport.INSPECTOR(), keurder.address);
  await passport.grantRole(await passport.INSPECTOR(), tweedeKeurder.address);
  await passport.grantRole(await passport.DEMOLISHER(), sloper.address);

  return { passport, admin, fabrikant, aannemer, keurder, tweedeKeurder, sloper, architect, buitenstaander };
}

/** Alle tijdlijnregels van een batch, in volgorde van uitzending. */
export async function timeline(passport: MaterialPassport, batchId: bigint) {
  const events = await passport.queryFilter(passport.filters.TimelineEvent(batchId));
  return events.map((event) => event.args);
}
