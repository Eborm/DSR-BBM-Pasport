/**
 * Domain concepts, matching contracts/MaterialPassport.sol (Sven's version).
 * Note: the order of each enum must stay exactly the same as the contract,
 * because Solidity passes an enum as a number (0, 1, 2, ...), not by name.
 *
 * This file replaced the original domain.ts from the team project. Functionality
 * that existed in the original contract but is not (yet) in Sven's contract
 * (claims, transfer, splitting, multiple roles per address) is deliberately NOT
 * reimplemented here -- the screens that used it (AddClaim, TransferSplit, Scan,
 * Verify) show a clear "not yet available" message instead. The Chain (developer
 * view) screen is kept, since it only reads raw blocks/transactions and doesn't
 * depend on contract-specific functionality.
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
  [Role.Viewer]: "Raadpleger",
  [Role.Manufacturer]: "Fabrikant",
  [Role.Inspector]: "Keuringsinstantie",
  [Role.Owner]: "Aannemer/eigenaar",
  [Role.Demolisher]: "Sloper",
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
  [SourceFile.Bim]: "BIM/IFC-model",
  [SourceFile.InspectionReport]: "Keuringsrapport",
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
  reason: "Geen account gekozen. Kies bovenaan een account om handelingen uit te voeren.",
};

/** `role` is `null` if no account is chosen. */
export function canRegister(role: Role | null): Permission {
  if (role === null) return NO_ACCOUNT;
  if (role !== Role.Manufacturer) {
    return { allowed: false, reason: "Alleen een account met de rol Fabrikant kan batches registreren." };
  }
  return ALLOWED;
}

/**
 * Functionality that is not yet in the contract. The screens that use this
 * (AddClaim, TransferSplit, Scan, Verify) show a clear message instead of a
 * crash or a confusing error.
 */
export const NOT_IMPLEMENTED: Permission = {
  allowed: false,
  reason: "Deze functionaliteit staat nog niet in het contract. Dit volgt in een latere iteratie.",
};
