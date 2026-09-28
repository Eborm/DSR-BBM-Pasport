/**
 * Domeinbegrippen uit SPEC §3 en §4, met Nederlandse labels voor de interface.
 * De rechten hieronder spiegelen de controles in het contract, zodat de app
 * vooraf kan uitleggen waarom een handeling niet mag. Het contract blijft de
 * enige die werkelijk beslist.
 */
import { keccak256, toUtf8Bytes } from "ethers";

const id = (name: string) => keccak256(toUtf8Bytes(name));

// ------------------------------------------------------------------ Rollen

export const ROLES = ["MANUFACTURER", "INSPECTOR", "OWNER", "DEMOLISHER"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_ID = Object.fromEntries(ROLES.map((role) => [role, id(role)])) as Record<Role, string>;

export const ROLE_LABEL: Record<Role, string> = {
  MANUFACTURER: "Fabrikant",
  INSPECTOR: "Keurder",
  OWNER: "Eigenaar",
  DEMOLISHER: "Sloper",
};

export const roleFromId = (roleId: string) => ROLES.find((role) => ROLE_ID[role] === roleId);

// ------------------------------------------------------- Soorten gebeurtenis

export const KINDS = ["registration", "inspection", "placement", "transfer", "split", "demolition", "reuse"] as const;
export type Kind = (typeof KINDS)[number];

export const KIND_ID = Object.fromEntries(KINDS.map((kind) => [kind, id(kind)])) as Record<Kind, string>;

export const KIND_LABEL: Record<Kind, string> = {
  registration: "Registratie",
  inspection: "Keuring",
  placement: "Plaatsing",
  transfer: "Overdracht",
  split: "Splitsing",
  demolition: "Demontage",
  reuse: "Hergebruik",
};

export const kindFromId = (kindId: string) => KINDS.find((kind) => KIND_ID[kind] === kindId);

/** Soorten die via "claim toevoegen" kunnen; de rest heeft een eigen functie. */
export const CLAIMABLE_KINDS: Kind[] = ["inspection", "placement", "demolition", "reuse"];

// ---------------------------------------------------------------- Gegevens

export const LEVELS = ["Grondstof", "Product", "Component", "Bouwelement"] as const;
export const UNITS = ["stuks", "kg", "ton", "m", "m2", "m3"] as const;

export interface Batch {
  id: bigint;
  materialType: string;
  quantity: bigint;
  unit: string;
  level: number;
  origin: string;
  productionDate: bigint;
  registrant: string;
  owner: string;
  metadataURI: string;
  parentId: bigint;
}

/** Eén regel op de tijdlijn, verrijkt met wat in andere events van dezelfde transactie staat. */
export interface Line {
  key: string;
  batchId: bigint;
  kind?: Kind;
  actor: string;
  timestamp: number;
  documentURI: string;
  documentHash: string;
  description: string;
  blockNumber: number;
  logIndex: number;
  txHash: string;
  transferTo?: string;
  split?: { parentId: bigint; childId: bigint; amount: bigint };
  /** Gezet als de regel uit de historie van een oorspronkelijke batch komt. */
  inheritedFrom?: bigint;
}

export const hasDocument = (line: Line) => line.documentURI !== "" && !/^0x0+$/.test(line.documentHash);

/**
 * De volledige historie van een batch. Een afgesplitste batch erft de regels
 * van zijn oorsprong tot aan de splitsing (SPEC §5).
 */
export function lineage(batchId: bigint, batches: Map<bigint, Batch>, lines: Map<bigint, Line[]>): Line[] {
  const own = lines.get(batchId) ?? [];
  const parentId = batches.get(batchId)?.parentId ?? 0n;
  if (parentId === 0n) return own;

  const parentLines = lineage(parentId, batches, lines);
  const splitIndex = parentLines.findIndex((line) => line.batchId === parentId && line.split?.childId === batchId);
  const inherited = (splitIndex === -1 ? parentLines : parentLines.slice(0, splitIndex)).map((line) => ({
    ...line,
    inheritedFrom: line.inheritedFrom ?? parentId,
  }));
  return [...inherited, ...own];
}

// ------------------------------------------------------------------ Status

export type Status = "geregistreerd" | "in-gebouw" | "beschikbaar";

export const STATUS_LABEL: Record<Status, string> = {
  geregistreerd: "Geregistreerd",
  "in-gebouw": "In gebouw",
  beschikbaar: "Beschikbaar",
};

/**
 * Status volgt uit de laatste levenscyclusgebeurtenis: plaatsing of hergebruik
 * betekent "in gebouw", demontage "beschikbaar". Er is (nog) geen soort
 * gebeurtenis die "gesloopt" (niet herbruikbaar) onderscheidt.
 */
export function statusOf(lines: Line[]): Status {
  let status: Status = "geregistreerd";
  for (const line of lines) {
    if (line.kind === "placement" || line.kind === "reuse") status = "in-gebouw";
    if (line.kind === "demolition") status = "beschikbaar";
  }
  return status;
}

// ----------------------------------------------------------------- Rechten

export interface Permission {
  allowed: boolean;
  reason?: string;
}

const ALLOWED: Permission = { allowed: true };
const NO_WALLET: Permission = {
  allowed: false,
  reason: "Geen wallet verbonden. Kies bovenaan een account om handelingen uit te voeren.",
};

/** `roles` is `null` als er geen wallet verbonden is. */
export function canRegister(roles: Role[] | null): Permission {
  if (!roles) return NO_WALLET;
  if (!roles.includes("MANUFACTURER")) {
    return { allowed: false, reason: "Alleen een adres met de rol Fabrikant kan batches registreren." };
  }
  if (roles.includes("INSPECTOR")) {
    return { allowed: false, reason: "Een Keurder kan geen eigenaar worden, dus ook geen batch registreren." };
  }
  return ALLOWED;
}

export function canClaim(kind: Kind, roles: Role[] | null, isOwner: boolean): Permission {
  if (!roles) return NO_WALLET;
  switch (kind) {
    case "inspection":
      return roles.includes("INSPECTOR")
        ? ALLOWED
        : { allowed: false, reason: "Alleen een Keurder kan een keuring toevoegen." };
    case "demolition":
      return roles.includes("DEMOLISHER")
        ? ALLOWED
        : { allowed: false, reason: "Alleen een Sloper kan een demontage claimen." };
    case "placement":
    case "reuse":
      if (!roles.includes("OWNER")) {
        return { allowed: false, reason: "Alleen een Eigenaar kan plaatsing en hergebruik claimen." };
      }
      return isOwner ? ALLOWED : { allowed: false, reason: "Alleen de huidige eigenaar van deze batch kan dit claimen." };
    default:
      return { allowed: false, reason: "Deze soort gebeurtenis heeft een eigen handeling." };
  }
}

export function canClaimAny(roles: Role[] | null, isOwner: boolean): Permission {
  if (!roles) return NO_WALLET;
  if (CLAIMABLE_KINDS.some((kind) => canClaim(kind, roles, isOwner).allowed)) return ALLOWED;
  return roles.includes("OWNER")
    ? { allowed: false, reason: "Alleen de huidige eigenaar, een Keurder of een Sloper kan claims toevoegen aan deze batch." }
    : { allowed: false, reason: "Claims toevoegen kan alleen met de rol Keurder, Sloper, of als Eigenaar van deze batch." };
}

export function canTransfer(roles: Role[] | null, isOwner: boolean): Permission {
  if (!roles) return NO_WALLET;
  if (!roles.includes("MANUFACTURER") && !roles.includes("OWNER")) {
    return { allowed: false, reason: "Alleen een Fabrikant of Eigenaar kan batches overdragen." };
  }
  return isOwner ? ALLOWED : { allowed: false, reason: "Alleen de huidige eigenaar kan deze batch overdragen." };
}

export function canSplit(roles: Role[] | null, isOwner: boolean, quantity: bigint): Permission {
  if (!roles) return NO_WALLET;
  if (!roles.includes("OWNER")) return { allowed: false, reason: "Alleen een Eigenaar kan batches splitsen." };
  if (!isOwner) return { allowed: false, reason: "Alleen de huidige eigenaar kan deze batch splitsen." };
  if (quantity < 2n) return { allowed: false, reason: "Een batch van één eenheid kan niet worden gesplitst." };
  return ALLOWED;
}

/** Waarom het contract deze ontvanger zal weigeren, of `undefined` als dat niet zo is. */
export function recipientProblem(roles: Role[]): string | undefined {
  if (roles.includes("INSPECTOR")) return "Een Keurder kan geen eigenaar worden: wie keurt, mag er geen belang bij hebben.";
  if (!roles.includes("OWNER")) return "De ontvanger heeft de rol Eigenaar niet; zonder die rol zou de batch vastlopen.";
  return undefined;
}
