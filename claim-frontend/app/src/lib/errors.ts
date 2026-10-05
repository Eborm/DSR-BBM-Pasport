/**
 * Translates a rejected transaction into plain language.
 *
 * MaterialPassport uses require() strings, which ethers.js already returns via
 * `reason` or `shortMessage`. ClaimRegistry uses custom errors (NotAllowed,
 * EmptyHash, NotAdmin); those arrive as raw revert data that has to be decoded
 * with the contract's own interface, so pass that in as `contractInterface`.
 */
import type { Interface } from "ethers";
import { CLAIM_TYPE_LABEL, allowedRolesLabel, type ClaimType } from "./domain";

export interface Explained {
  message: string;
  technical?: string;
}

/** Decodes a custom error of the contract, if the error carries revert data. */
function decodeCustomError(error: any, contractInterface: Interface) {
  if (error?.revert?.name) return { name: error.revert.name as string, args: error.revert.args as readonly unknown[] };
  const data = error?.data ?? error?.info?.error?.data;
  if (typeof data !== "string" || !data.startsWith("0x") || data.length < 10) return null;
  try {
    const parsed = contractInterface.parseError(data);
    return parsed ? { name: parsed.name, args: parsed.args as readonly unknown[] } : null;
  } catch {
    return null;
  }
}

function explainCustomError(name: string, args: readonly unknown[]): string | null {
  switch (name) {
    case "NotAllowed": {
      const type = Number(args[1]) as ClaimType;
      if (!(type in CLAIM_TYPE_LABEL)) return "This account may not add this claim.";
      return `This account may not add a ${CLAIM_TYPE_LABEL[type].toLowerCase()}. Only these roles can: ${allowedRolesLabel(type)}.`;
    }
    case "EmptyHash":
      return "The document has no valid hash. Choose a file or enter a hash.";
    case "NotAdmin":
      return "Only the administrator can assign roles.";
    default:
      return null;
  }
}

export function explainError(error: unknown, contractInterface?: Interface): Explained {
  const e = error as { reason?: string; shortMessage?: string; message?: string; code?: string };

  if (e?.code === "NETWORK_ERROR" || e?.code === "SERVER_ERROR" || /fetch|ECONNREFUSED/i.test(e?.message ?? "")) {
    return { message: "No connection to the chain. Is the demo still running?", technical: e?.message };
  }
  if (e?.code === "ACTION_REJECTED") {
    return { message: "The transaction was not signed." };
  }
  if (contractInterface) {
    const custom = decodeCustomError(error, contractInterface);
    if (custom) {
      const message = explainCustomError(custom.name, custom.args);
      if (message) return { message, technical: `${custom.name}(${custom.args.map(String).join(", ")})` };
    }
  }
  if (typeof e?.reason === "string" && e.reason) {
    return { message: e.reason, technical: e.shortMessage };
  }
  if (typeof e?.shortMessage === "string" && e.shortMessage) {
    return { message: e.shortMessage };
  }
  return { message: e?.message ?? "Something went wrong.", technical: e?.message };
}
