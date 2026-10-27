/**
 * Client for the API in server/api.ts (requirement 4), which also keeps the
 * off-chain documents. In development Vite forwards /api to that server.
 *
 * The browser never takes the server's word for it: a document that comes back
 * is hashed here and compared with the hash on the chain.
 */
import {
  hashBytes,
  parseDeclaration,
  type CircularityDeclaration,
  type Verification,
} from "./circularity";

export const apiUrl = {
  batch: (id: bigint) => `/api/v1/batches/${id}`,
  batchJsonLd: (id: bigint) => `/api/v1/batches/${id}?format=jsonld`,
  claims: (id: bigint) => `/api/v1/batches/${id}/claims`,
  circularity: (id: bigint) => `/api/v1/batches/${id}/circularity`,
  document: (hash: string) => `/api/v1/documents/${hash}`,
  openApi: () => "/api/v1/openapi.json",
};

/** Stores a document off-chain. Returns the hash the server calculated, which is what goes on the chain. */
export async function storeDocument(bytes: Uint8Array): Promise<string> {
  let response: Response;
  try {
    response = await fetch("/api/v1/documents", {
      method: "POST",
      headers: { "content-type": "application/octet-stream" },
      body: new Blob([bytes as BlobPart]),
    });
  } catch {
    throw new Error("De documentopslag is niet bereikbaar. Draait de demo nog?");
  }
  if (!response.ok) {
    // The API's own explanation is in English (it is meant for other systems), so the screen gets a Dutch message.
    throw new Error(
      response.status === 413
        ? "Het document is te groot voor de opslag (maximaal 5 MiB)."
        : `De documentopslag heeft het document geweigerd (status ${response.status}).`,
    );
  }
  const stored = (await response.json()) as { hash: string };
  return stored.hash;
}

export type DeclarationResult =
  | { state: "verified"; declaration: CircularityDeclaration }
  /** The bytes match the chain, but they are not a valid declaration. */
  | { state: "invalid"; problems: string[] }
  | { state: Exclude<Verification, "verified"> }
  /** The document store could not be reached at all. */
  | { state: "unavailable" };

/** Fetches the document behind a claim and checks it against the hash on the chain. */
export async function loadDeclaration(documentHash: string): Promise<DeclarationResult> {
  let response: Response;
  try {
    response = await fetch(apiUrl.document(documentHash));
  } catch {
    return { state: "unavailable" };
  }
  if (response.status === 404) return { state: "document-missing" };
  if (!response.ok) return { state: "unavailable" };

  const bytes = new Uint8Array(await response.arrayBuffer());
  if (hashBytes(bytes).toLowerCase() !== documentHash.toLowerCase()) return { state: "mismatch" };

  const parsed = parseDeclaration(bytes);
  return "declaration" in parsed ? { state: "verified", declaration: parsed.declaration } : { state: "invalid", problems: parsed.problems };
}
