/**
 * Vertaalt een geweigerde transactie naar gewone taal (SPEC §6.3). Het contract
 * weigert met custom errors; die staan in de ABI en komen hier met naam en
 * argumenten binnen.
 */
import { MaterialPassport__factory } from "../../../types/ethers-contracts/factories/MaterialPassport__factory.js";
import { ROLE_LABEL, roleFromId } from "./domain";
import { shortAddress } from "./format";

type Args = readonly unknown[];

const MESSAGES: Record<string, (args: Args) => string> = {
  AccessControlUnauthorizedAccount: ([account, role]) => {
    const label = roleFromId(String(role));
    return `Het adres ${shortAddress(String(account))} heeft niet de rol ${label ? ROLE_LABEL[label] : "die"} die hiervoor nodig is.`;
  },
  UnknownBatch: ([id]) => `Batch #${id} bestaat niet.`,
  NotOwner: ([id]) => `Alleen de huidige eigenaar van batch #${id} mag dit doen.`,
  EmptyHash: () => "Er is geen documenthash meegegeven.",
  ZeroQuantity: () => "De hoeveelheid moet groter zijn dan nul.",
  EmptyMaterialType: () => "Vul een materiaalsoort in.",
  EmptyUnit: () => "Kies een eenheid.",
  EmptyDocumentURI: () => "Er is geen document meegegeven.",
  InvalidAmount: ([amount, available]) =>
    `Ongeldig aantal: ${amount} van ${available}. Overdragen gaat per hele batch; splitsen alleen met een deel ervan.`,
  KindNotClaimable: () => "Deze soort gebeurtenis kan niet als claim worden toegevoegd.",
  NotAllowedToTransfer: () => "Alleen een Fabrikant of Eigenaar kan batches overdragen.",
  ZeroAddress: () => "Vul een geldig ontvangeradres in.",
  InspectorCannotOwn: ([account]) =>
    `${shortAddress(String(account))} is Keurder en kan geen eigenaar worden: wie keurt, mag er geen belang bij hebben.`,
  RecipientWithoutOwnerRole: ([account]) =>
    `${shortAddress(String(account))} heeft de rol Eigenaar niet. Zonder die rol zou de batch vastlopen.`,
  DirectTransferDisabled: () => "Directe tokenoverdracht is uitgeschakeld; gebruik overdragen of splitsen.",
};

export interface Explained {
  message: string;
  /** Naam van de custom error, als het contract die gaf. */
  error?: string;
  technical?: string;
}

const contractInterface = MaterialPassport__factory.createInterface();

/**
 * Bij versturen via een wallet decodeert ethers de custom error niet zelf; dan
 * staat alleen de ruwe revert-data in de fout en doen we het met de ABI.
 */
function decodeRevert(e: { revert?: { name: string; args: Args } | null; data?: unknown; info?: { error?: { data?: unknown } } }) {
  if (e?.revert?.name) return e.revert;
  for (const data of [e?.data, e?.info?.error?.data]) {
    if (typeof data !== "string" || data.length < 10) continue;
    try {
      const parsed = contractInterface.parseError(data);
      if (parsed) return { name: parsed.name, args: [...parsed.args] as Args };
    } catch {
      // Geen fout uit dit contract.
    }
  }
  return undefined;
}

export function explainError(error: unknown): Explained {
  const e = error as {
    revert?: { name: string; args: Args } | null;
    data?: unknown;
    info?: { error?: { data?: unknown } };
    code?: string;
    shortMessage?: string;
    message?: string;
  };
  const revert = decodeRevert(e);
  if (revert) {
    const explain = MESSAGES[revert.name];
    return {
      message: explain ? explain(revert.args) : "Het contract heeft de transactie geweigerd.",
      error: revert.name,
      technical: e.shortMessage,
    };
  }
  if (e?.code === "NETWORK_ERROR" || e?.code === "SERVER_ERROR" || /fetch|ECONNREFUSED/i.test(e?.message ?? "")) {
    return { message: "Geen verbinding met de keten of de documentopslag. Draait de demo nog?", technical: e?.message };
  }
  return { message: e?.shortMessage ?? e?.message ?? "Er ging iets mis.", technical: e?.message };
}
