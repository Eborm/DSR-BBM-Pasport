/** Minimal hash router: #/batch/1, #/batch/1/claim, #/registreren, ... */
import { useSyncExternalStore } from "react";

export type Route =
  | { screen: "overzicht" }
  | { screen: "batch"; id: bigint }
  | { screen: "claim"; id: bigint }
  | { screen: "overdragen"; id: bigint; mode: "overdragen" | "splitsen" }
  | { screen: "registreren" }
  | { screen: "scannen" }
  | { screen: "verifieren"; id?: bigint }
  | { screen: "keten"; block?: number }
  | { screen: "onbekend" };

export function parseRoute(hash: string): Route {
  const parts = hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  const id = parts[1] && /^\d+$/.test(parts[1]) ? BigInt(parts[1]) : undefined;
  switch (parts[0]) {
    case undefined:
      return { screen: "overzicht" };
    case "registreren":
      return { screen: "registreren" };
    case "scannen":
      return { screen: "scannen" };
    case "verifieren":
      return { screen: "verifieren", id };
    case "keten":
      return { screen: "keten", block: id === undefined ? undefined : Number(id) };
    case "batch":
      if (id === undefined) return { screen: "onbekend" };
      if (parts[2] === "claim") return { screen: "claim", id };
      if (parts[2] === "overdragen" || parts[2] === "splitsen") return { screen: "overdragen", id, mode: parts[2] };
      return { screen: "batch", id };
    default:
      return { screen: "onbekend" };
  }
}

export const href = {
  overzicht: () => "#/",
  batch: (id: bigint) => `#/batch/${id}`,
  claim: (id: bigint) => `#/batch/${id}/claim`,
  overdragen: (id: bigint) => `#/batch/${id}/overdragen`,
  splitsen: (id: bigint) => `#/batch/${id}/splitsen`,
  registreren: () => "#/registreren",
  scannen: () => "#/scannen",
  verifieren: (id?: bigint) => (id === undefined ? "#/verifieren" : `#/verifieren/${id}`),
  keten: (block?: number) => (block === undefined ? "#/keten" : `#/keten/${block}`),
};

export const navigate = (target: string) => {
  window.location.hash = target;
};

const subscribe = (callback: () => void) => {
  window.addEventListener("hashchange", callback);
  return () => window.removeEventListener("hashchange", callback);
};

export function useHash() {
  return useSyncExternalStore(subscribe, () => window.location.hash);
}

/** Batch ID from QR code content: an app link (...#/batch/7) or just a number. */
export function batchIdFromCode(code: string): bigint | undefined {
  const match = code.trim().match(/batch\/(\d+)/) ?? code.trim().match(/^#?(\d+)$/);
  return match ? BigInt(match[1]) : undefined;
}
