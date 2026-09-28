/**
 * Documenten buiten de keten (SPEC §3.3). De URI zegt waar een document staat,
 * de hash op de keten zegt wat erin hoort te staan. De hash gaat altijd over de
 * bytes van het bestand, nooit over de URI.
 */
import { keccak256 } from "ethers";

export async function readBytes(file: Blob): Promise<Uint8Array> {
  return new Uint8Array(await file.arrayBuffer());
}

export const hashBytes = (bytes: Uint8Array) => keccak256(bytes);

/** Stap 1 van een claim: opslaan en de URI terugkrijgen. */
export async function uploadDocument(storageUrl: string, file: File, bytes: Uint8Array): Promise<string> {
  const response = await fetch(`${storageUrl}/documents`, {
    method: "POST",
    headers: {
      "content-type": file.type || "application/octet-stream",
      "x-filename": encodeURIComponent(file.name),
    },
    body: bytes as BodyInit,
  });
  if (!response.ok) throw new Error(`De documentopslag weigerde het bestand (${response.status}).`);
  const { uri } = (await response.json()) as { uri: string };
  return uri;
}

export type Verification =
  | { state: "controleren" }
  | { state: "ok"; name: string }
  | { state: "afwijkend"; name: string; actualHash: string }
  | { state: "onbereikbaar"; reason: string };

/**
 * Haalt het document op, berekent de hash opnieuw over de bytes en vergelijkt
 * die met de hash op de keten. Nooit een vinkje zonder herberekening.
 */
export async function verifyDocument(uri: string, expectedHash: string): Promise<Verification> {
  let response: Response;
  try {
    response = await fetch(uri, { cache: "no-store" });
  } catch {
    return { state: "onbereikbaar", reason: "De documentopslag is niet bereikbaar." };
  }
  if (!response.ok) {
    return { state: "onbereikbaar", reason: `Het document is niet gevonden (${response.status}).` };
  }
  const name = decodeURIComponent(response.headers.get("x-filename") ?? "") || fileNameFromUri(uri);
  const actualHash = hashBytes(await readBytes(await response.blob()));
  return actualHash.toLowerCase() === expectedHash.toLowerCase()
    ? { state: "ok", name }
    : { state: "afwijkend", name, actualHash };
}

export const fileNameFromUri = (uri: string) => uri.split("/").pop() || "document";
