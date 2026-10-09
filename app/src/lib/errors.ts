/**
 * Translates a rejected transaction into plain language.
 *
 * MaterialPassport uses custom errors (WrongRole, NotAllowed, EmptyHash, ...).
 * Those arrive as raw revert data that has to be decoded with the contract's
 * own interface, so pass that in as `contractInterface`.
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
      if (!(type in CLAIM_TYPE_LABEL)) return "Dit account mag deze claim niet toevoegen.";
      return `Dit account mag geen ${CLAIM_TYPE_LABEL[type].toLowerCase()} toevoegen. Alleen deze rollen mogen dit: ${allowedRolesLabel(type)}.`;
    }
    case "EmptyHash":
      return "Het document heeft geen geldige hash. Kies een bestand of voer een hash in.";
    case "NotAdmin":
      return "Alleen de administrator kan rollen toewijzen.";
    case "WrongRole":
      return "Dit account heeft niet de juiste rol voor deze actie.";
    case "EmptyProducer":
      return "De producent mag niet leeg zijn.";
    case "EmptyMaterialType":
      return "De materiaalsoort mag niet leeg zijn.";
    case "EmptyOrigin":
      return "De herkomst mag niet leeg zijn.";
    case "InvalidMass":
      return "De massa moet groter zijn dan nul.";
    case "InvalidProductionDate":
      return "De productiedatum mag niet in de toekomst liggen.";
    case "BatchNotFound":
      return `Batch #${String(args[0])} bestaat niet.`;
    default:
      return null;
  }
}

export function explainError(error: unknown, contractInterface?: Interface): Explained {
  const e = error as { reason?: string; shortMessage?: string; message?: string; code?: string };

  if (e?.code === "NETWORK_ERROR" || e?.code === "SERVER_ERROR" || /fetch|ECONNREFUSED/i.test(e?.message ?? "")) {
    return { message: "Geen verbinding met de Chain. Draait de demo nog?", technical: e?.message };
  }
  if (e?.code === "ACTION_REJECTED") {
    return { message: "De transactie is niet ondertekend." };
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
  return { message: e?.message ?? "Er is iets misgegaan.", technical: e?.message };
}
