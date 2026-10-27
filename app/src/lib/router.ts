/** Minimal hash router: #/batch/1, #/batch/1/claim, #/register, ... */
import { useSyncExternalStore } from "react";

export type Route =
  | { screen: "overview" }
  | { screen: "batch"; id: bigint }
  | { screen: "claim"; id: bigint }
  | { screen: "circularity"; id: bigint }
  | { screen: "transfer"; id: bigint; mode: "transfer" | "split" }
  | { screen: "register" }
  | { screen: "scan" }
  | { screen: "verify"; id?: bigint }
  | { screen: "chain"; block?: number }
  | { screen: "timeline"; id: bigint }
  | { screen: "unknown" };

export function parseRoute(hash: string): Route {
  const parts = hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  const id = parts[1] && /^\d+$/.test(parts[1]) ? BigInt(parts[1]) : undefined;
  switch (parts[0]) {
    case undefined:
      return { screen: "overview" };
    case "register":
      return { screen: "register" };
    case "scan":
      return { screen: "scan" };
    case "verify":
      return { screen: "verify", id };
    case "chain":
      return { screen: "chain", block: id === undefined ? undefined : Number(id) };
    case "batch":
      if (id === undefined) return { screen: "unknown" };
      if (parts[2] === "claim") return { screen: "claim", id };
      if (parts[2] === "circularity") return { screen: "circularity", id };
      if (parts[2] === "transfer" || parts[2] === "split") return { screen: "transfer", id, mode: parts[2] };
      return { screen: "batch", id };
    case "timeline":
      if (id === undefined) return { screen: "unknown" };
      return { screen: "timeline", id };
    default:
      return { screen: "unknown" };
  }
}

export const href = {
  overview: () => "#/",
  batch: (id: bigint) => `#/batch/${id}`,
  claim: (id: bigint) => `#/batch/${id}/claim`,
  circularity: (id: bigint) => `#/batch/${id}/circularity`,
  transfer: (id: bigint) => `#/batch/${id}/transfer`,
  split: (id: bigint) => `#/batch/${id}/split`,
  register: () => "#/register",
  scan: () => "#/scan",
  verify: (id?: bigint) => (id === undefined ? "#/verify" : `#/verify/${id}`),
  chain: (block?: number) => (block === undefined ? "#/chain" : `#/chain/${block}`),
  timeline: (id: bigint) => `#/timeline/${id}`,
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
