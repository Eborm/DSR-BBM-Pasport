/**
 * Requirement 3: circularity and environmental information.
 *
 * The data itself is NOT stored on the chain (see "Wat waar wordt opgeslagen"
 * in the design document). A declaration is a small JSON document that lives
 * in the off-chain document store; only its keccak256 hash goes on the chain,
 * as a claim of type CircularityInfo.
 *
 * This file has no React or browser dependencies, so both the web app and the
 * API server (server/api.ts) use it.
 */
import { keccak256, toUtf8Bytes } from "ethers";

export const DECLARATION_SCHEMA = "bbm-passport/circularity-declaration/v1";

export const REPAIR_LEVELS = ["none", "limited", "good", "full"] as const;
export type RepairLevel = (typeof REPAIR_LEVELS)[number];

export const REPAIR_LABEL: Record<RepairLevel, string> = {
  none: "Niet repareerbaar",
  limited: "Beperkt repareerbaar",
  good: "Goed repareerbaar",
  full: "Volledig repareerbaar",
};

export interface CircularityDeclaration {
  schema: typeof DECLARATION_SCHEMA;
  /** Decimal string, because batch IDs are uint256 on the chain. */
  batchId: string;
  /** Share of the mass that can be reused as it is, 0-100. */
  reusablePercent: number;
  /** Share of the mass that can be recycled, 0-100. */
  recyclablePercent: number;
  repairability: RepairLevel;
  /** Share of secondary raw materials in this batch, 0-100. */
  recycledContentPercent: number;
  /** Estimated residual value of the whole batch in euro. */
  residualValueEur: number;
  /** Possible next applications, 1 to 10 short descriptions. */
  nextApplications: string[];
  environment: {
    /**
     * Global warming potential (GWP-total), modules A1-A3, in kg CO2-eq per
     * kg of material. Follows the EN 15804+A2 indicator of an EPD.
     */
    gwpA1A3KgCo2ePerKg: number;
    /** keccak256 of the EPD file itself, if there is one (the EPD stays off-chain too). */
    epdHash?: string;
  };
}

export const MAX_NEXT_APPLICATIONS = 10;
export const MAX_APPLICATION_LENGTH = 100;

const HASH = /^0x[0-9a-fA-F]{64}$/;
const isPercent = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100;
const isNonNegative = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0;

/** Returns a list of problems; an empty list means the value is a valid declaration. */
export function validateDeclaration(value: unknown): string[] {
  const problems: string[] = [];
  if (typeof value !== "object" || value === null || Array.isArray(value)) return ["The declaration must be a JSON object."];
  const d = value as Record<string, unknown>;

  if (d.schema !== DECLARATION_SCHEMA) problems.push(`schema must be "${DECLARATION_SCHEMA}".`);
  if (typeof d.batchId !== "string" || !/^[1-9]\d*$/.test(d.batchId)) problems.push("batchId must be a positive whole number as text.");
  if (!isPercent(d.reusablePercent)) problems.push("reusablePercent must be a number from 0 to 100.");
  if (!isPercent(d.recyclablePercent)) problems.push("recyclablePercent must be a number from 0 to 100.");
  if (!isPercent(d.recycledContentPercent)) problems.push("recycledContentPercent must be a number from 0 to 100.");
  if (!REPAIR_LEVELS.includes(d.repairability as RepairLevel)) problems.push(`repairability must be one of: ${REPAIR_LEVELS.join(", ")}.`);
  if (!isNonNegative(d.residualValueEur)) problems.push("residualValueEur must be a number of 0 or more.");

  const apps = d.nextApplications;
  if (
    !Array.isArray(apps) ||
    apps.length < 1 ||
    apps.length > MAX_NEXT_APPLICATIONS ||
    !apps.every((a) => typeof a === "string" && a.trim().length > 0 && a.length <= MAX_APPLICATION_LENGTH)
  ) {
    problems.push(`nextApplications must hold 1 to ${MAX_NEXT_APPLICATIONS} descriptions of at most ${MAX_APPLICATION_LENGTH} characters.`);
  }

  const env = d.environment as Record<string, unknown> | undefined;
  if (typeof env !== "object" || env === null || Array.isArray(env)) {
    problems.push("environment must be an object.");
  } else {
    if (!isNonNegative(env.gwpA1A3KgCo2ePerKg)) problems.push("environment.gwpA1A3KgCo2ePerKg must be a number of 0 or more.");
    if (env.epdHash !== undefined && !(typeof env.epdHash === "string" && HASH.test(env.epdHash))) {
      problems.push("environment.epdHash must be 0x followed by 64 hexadecimal characters.");
    }
  }
  return problems;
}

/**
 * Canonical JSON: keys sorted, no whitespace. For the kind of data used here
 * (strings, finite numbers, arrays, objects) this gives the same output as the
 * JSON Canonicalization Scheme (RFC 8785), so any other system can reproduce
 * the exact bytes, and so the hash, from the same declaration.
 */
export function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  const object = value as Record<string, unknown>;
  const keys = Object.keys(object)
    .filter((key) => object[key] !== undefined)
    .sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalize(object[key])}`).join(",")}}`;
}

/** The exact bytes that are stored off-chain, and hashed for the claim. */
export const declarationBytes = (declaration: CircularityDeclaration) => toUtf8Bytes(canonicalize(declaration));

export const hashBytes = (bytes: Uint8Array) => keccak256(bytes);

/** Parses stored bytes into a declaration, or explains why that is not possible. */
export function parseDeclaration(bytes: Uint8Array): { declaration: CircularityDeclaration } | { problems: string[] } {
  let json: unknown;
  try {
    json = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    return { problems: ["The document is not valid JSON."] };
  }
  const problems = validateDeclaration(json);
  return problems.length > 0 ? { problems } : { declaration: json as CircularityDeclaration };
}

/** How a stored document relates to the hash on the chain. */
export type Verification = "verified" | "mismatch" | "document-missing";
