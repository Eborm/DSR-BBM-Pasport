/**
 * Domain concepts, matching contracts/MaterialPassport.sol.
 * Note: the order of each enum must stay exactly the same as the contract,
 * because Solidity passes an enum as a number (0, 1, 2, ...), not by name.
 *
 * This file replaced the original domain.ts from the team project. Functionality
 * that is not (yet) in the contract (transfer, splitting, multiple roles per
 * address) is deliberately NOT reimplemented here -- the screens that used it
 * (TransferSplit, Scan) show a clear "not yet available" message instead.
 * Claims live in the same contract as the batches and share its roles; their
 * types are at the bottom of this file. The Chain (developer view) screen is
 * kept, since it only reads raw blocks/transactions and doesn't depend on
 * contract-specific functionality.
 */

// ------------------------------------------------------------------ Roles

export enum Role {
  Viewer,
  Manufacturer,
  Inspector,
  Owner,
  Demolisher,
}

export const ROLE_LABEL: Record<Role, string> = {
  [Role.Viewer]: "Viewer",
  [Role.Manufacturer]: "Manufacturer",
  [Role.Inspector]: "Inspector",
  [Role.Owner]: "Owner",
  [Role.Demolisher]: "Demolisher",
};

// --------------------------------------------------------------- Other enums

export enum Classification {
  A1,
  A2,
  B,
  C,
  D,
  E,
  F,
}

export const CLASSIFICATION_LABEL: Record<Classification, string> = {
  [Classification.A1]: "A1",
  [Classification.A2]: "A2",
  [Classification.B]: "B",
  [Classification.C]: "C",
  [Classification.D]: "D",
  [Classification.E]: "E",
  [Classification.F]: "F",
};

export enum Level {
  RawMaterial,
  Product,
  Component,
  BuildingElement,
}

export const LEVELS = ["Grondstof", "Product", "Component", "Bouwelement"] as const;
export const LEVEL_LABEL: Record<Level, string> = {
  [Level.RawMaterial]: LEVELS[0],
  [Level.Product]: LEVELS[1],
  [Level.Component]: LEVELS[2],
  [Level.BuildingElement]: LEVELS[3],
};

export enum SourceFile {
  Bim,
  InspectionReport,
  DemolitionInventory,
}

export const SOURCE_FILE_LABEL: Record<SourceFile, string> = {
  [SourceFile.Bim]: "BIM/IFC model",
  [SourceFile.InspectionReport]: "Inspectierapport",
  [SourceFile.DemolitionInventory]: "Sloopinventaris",
};

// ---------------------------------------------------------------- Data

export interface Batch {
  id: bigint;
  producer: string;
  classification: Classification;
  materialType: string;
  level: Level;
  mass: bigint;
  origin: string;
  productionDate: bigint;
  currentOwner: string;
  registeredAt: bigint;
  sourceFile: SourceFile;
}

// ----------------------------------------------------------------- Permissions

export interface Permission {
  allowed: boolean;
  reason?: string;
}

const ALLOWED: Permission = { allowed: true };
const NO_ACCOUNT: Permission = {
  allowed: false,
  reason: "Geen account geselecteerd. Kies bovenaan een account om acties uit te voeren.",
};

/** `role` is `null` if no account is chosen. */
export function canRegister(role: Role | null): Permission {
  if (role === null) return NO_ACCOUNT;
  if (role !== Role.Manufacturer) {
    return { allowed: false, reason: "Alleen een account met de rol Manufacturer kan batches registreren." };
  }
  return ALLOWED;
}

/**
 * Functionality that is not yet in the contract. The screens that use this
 * (TransferSplit, Scan) show a clear message instead of a crash or a
 * confusing error.
 */
export const NOT_IMPLEMENTED: Permission = {
  allowed: false,
  reason: "Deze functionaliteit zit nog niet in het contract. Dit volgt in een latere versie.",
};

// ------------------------------------------------------------ Claims

export enum ClaimType {
  StatusChange,
  LocationChange,
  QualityDeclaration,
  /** Written by MaterialPassport when a batch is registered; nobody can add it by hand. */
  Registration,
  /** Written by MaterialPassport when ownership of a batch is transferred; nobody can add it by hand. */
  OwnershipTransfer,
}

/** The claim types a user can add by hand. Registration and OwnershipTransfer are written by the contract itself. */
export const CLAIM_TYPES: readonly ClaimType[] = [ClaimType.StatusChange, ClaimType.LocationChange, ClaimType.QualityDeclaration];

export const CLAIM_TYPE_LABEL: Record<ClaimType, string> = {
  [ClaimType.StatusChange]: "Statuswijziging",
  [ClaimType.LocationChange]: "Locatiewijziging",
  [ClaimType.QualityDeclaration]: "Kwaliteitsverklaring",
  [ClaimType.Registration]: "Registration",
  [ClaimType.OwnershipTransfer]: "Ownership transfer",
};

/** Mirrors `_mayClaim` in ClaimRegistry.sol: who may add which type of claim. */
export const CLAIM_TYPE_ALLOWED: Record<ClaimType, readonly ClaimRole[]> = {
  [ClaimType.StatusChange]: [ClaimRole.Owner, ClaimRole.Demolisher],
  [ClaimType.LocationChange]: [ClaimRole.Owner],
  [ClaimType.QualityDeclaration]: [ClaimRole.Inspector],
  // Only the MaterialPassport contract can write these (see recordClaimFor in ClaimRegistry.sol).
  [ClaimType.Registration]: [],
  [ClaimType.OwnershipTransfer]: [],
};

export interface Claim {
  batchId: bigint;
  submitter: string;
  /** keccak256 of the document, as 0x + 64 hex characters. */
  documentHash: string;
  /** Block time (Unix seconds). */
  timestamp: bigint;
  claimType: ClaimType;
  /** Position within the claims of this batch; the contract never reorders or removes. */
  index: number;
}

const allowedLabels = (type: ClaimType) => CLAIM_TYPE_ALLOWED[type].map((r) => ROLE_LABEL[r]).join(" or ");

/** `role` is `null` if no account is chosen. */
export function canAddClaim(role: Role | null, type: ClaimType): Permission {
  if (role === null) return NO_ACCOUNT;
  if (!CLAIM_TYPE_ALLOWED[type].includes(role)) {
    return {
      allowed: false,
      reason: `Een ${CLAIM_TYPE_LABEL[type].toLowerCase()} kan alleen worden toegevoegd door: ${allowedLabels(type)}.`,
    };
  }
  return ALLOWED;
}

/** Is there any claim type this role may add at all? Used for the button on the batch screen. */
export function canAddAnyClaim(role: Role | null): Permission {
  if (role === null) return NO_ACCOUNT;
  if (!CLAIM_TYPES.some((type) => CLAIM_TYPE_ALLOWED[type].includes(role))) {
    return {
      allowed: false,
      reason: "De rol van dit account kan geen claims toevoegen. Alleen een Owner, Inspector of Demolisher kan dit.",
    };
  }
  return ALLOWED;
}

export const claimTypesFor = (role: Role | null) =>
  role === null ? [] : CLAIM_TYPES.filter((type) => CLAIM_TYPE_ALLOWED[type].includes(role));

export const allowedRolesLabel = allowedLabels;