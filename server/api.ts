/**
 * Requirement 4: interoperability through open standards and APIs.
 *
 * A small read API on top of the chain, plus the off-chain document store:
 *
 *   GET  /api/v1/batches                     list and search batches
 *   GET  /api/v1/batches/{id}                one batch (JSON, or JSON-LD)
 *   GET  /api/v1/batches/{id}/claims         the timeline of a batch
 *   GET  /api/v1/batches/{id}/circularity    latest circularity declaration, checked against the chain
 *   GET  /api/v1/documents/{hash}            an off-chain document, addressed by its hash
 *   POST /api/v1/documents                   store an off-chain document
 *   GET  /api/v1/openapi.json                OpenAPI 3.1 description of all of this
 *
 * Reading is open to everyone (as in the design document). The API cannot
 * change anything on the chain: that always goes through the contract, which
 * checks the role of the sender. Documents are stored under their own
 * keccak256 hash, so the hash on the chain is also the reference to the
 * document, and a changed file is noticed because it no longer matches.
 *
 *   tsx server/api.ts       (npm run demo starts it for you)
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { Contract, JsonRpcProvider } from "ethers";
import { hashBytes, parseDeclaration, type Verification } from "../app/src/lib/circularity";
import { Classification, ClaimType, Level, SourceFile } from "../app/src/lib/domain";
import { declarationSchema, openApiDocument } from "./openapi";

const PORT = Number(process.env.API_PORT ?? 8787);
const RPC_URL = process.env.RPC_URL ?? "http://127.0.0.1:8545";
const DEPLOYMENT_FILE = process.env.DEPLOYMENT_FILE ?? "app/public/deployment.json";
const DOCUMENT_DIR = process.env.DOCUMENT_DIR ?? ".demo/documents";
const MAX_DOCUMENT_BYTES = 5 * 1024 * 1024;
const HASH = /^0x[0-9a-f]{64}$/;
const LEVEL_NAMES = ["RawMaterial", "Product", "Component", "BuildingElement"];

// ------------------------------------------------------------------ Chain

let contract: Contract | undefined;
async function getContract() {
  if (!contract) {
    const deployment = JSON.parse(await readFile(DEPLOYMENT_FILE, "utf8"));
    contract = new Contract(deployment.address, deployment.abi, new JsonRpcProvider(RPC_URL));
  }
  return contract;
}

const iso = (seconds: bigint) => new Date(Number(seconds) * 1000).toISOString();

async function readBatch(id: bigint) {
  const raw = await (await getContract()).batches(id);
  if (raw.id === 0n) return null;
  const base = `/api/v1/batches/${id}`;
  return {
    id: String(raw.id),
    producer: raw.producer as string,
    materialType: raw.materialType as string,
    classification: Classification[Number(raw.classification)],
    level: Level[Number(raw.level)],
    mass: { value: Number(raw.mass), unit: "kg" },
    origin: raw.origin as string,
    productionDate: iso(raw.productionDate),
    registeredAt: iso(raw.registeredAt),
    currentOwner: raw.currentOwner as string,
    sourceFile: SourceFile[Number(raw.sourceFile)],
    links: { self: base, claims: `${base}/claims`, circularity: `${base}/circularity`, jsonld: `${base}?format=jsonld` },
  };
}
type BatchResource = NonNullable<Awaited<ReturnType<typeof readBatch>>>;

async function readClaims(id: bigint) {
  const raw: any[] = await (await getContract()).getClaims(id);
  return raw.map((c, index) => ({
    index,
    type: ClaimType[Number(c.claimType)],
    submitter: c.submitter as string,
    timestamp: iso(c.timestamp),
    documentHash: c.documentHash as string,
    documentUrl: `/api/v1/documents/${c.documentHash}`,
  }));
}

/**
 * The same batch as schema.org JSON-LD, so systems that do not know this API
 * can still read it. This is a pragmatic mapping onto schema.org's Product,
 * not an official digital product passport schema.
 */
function toJsonLd(batch: BatchResource, origin: string) {
  const property = (name: string, value: string) => ({ "@type": "PropertyValue", name, value });
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    "@id": `${origin}${batch.links.self}`,
    identifier: batch.id,
    name: batch.materialType,
    manufacturer: { "@type": "Organization", name: batch.producer },
    weight: { "@type": "QuantitativeValue", value: batch.mass.value, unitCode: "KGM" },
    productionDate: batch.productionDate,
    additionalProperty: [
      property("classification", batch.classification),
      property("level", batch.level),
      property("origin", batch.origin),
      property("currentOwner", batch.currentOwner),
    ],
  };
}

// -------------------------------------------------------------- Documents

async function readDocument(hash: string): Promise<Uint8Array | null> {
  try {
    return await readFile(`${DOCUMENT_DIR}/${hash}`);
  } catch {
    return null;
  }
}

async function readBody(request: IncomingMessage): Promise<Uint8Array | null> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    size += (chunk as Buffer).length;
    if (size > MAX_DOCUMENT_BYTES) return null;
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks);
}

// ------------------------------------------------------------------- HTTP

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

const TITLES: Record<number, string> = { 400: "Bad request", 404: "Not found", 405: "Method not allowed", 413: "Document too large", 500: "Internal error", 502: "Chain unavailable" };

function send(response: ServerResponse, status: number, body: unknown, type = "application/json", extra: Record<string, string> = {}) {
  const payload = body instanceof Uint8Array ? body : JSON.stringify(body);
  response.writeHead(status, {
    "content-type": type,
    // Reading is open to everyone, so any website may read from this API.
    "access-control-allow-origin": "*",
    "x-content-type-options": "nosniff",
    "cache-control": "no-store",
    ...extra,
  });
  response.end(payload);
}

const sendProblem = (response: ServerResponse, status: number, detail: string) =>
  send(response, status, { type: "about:blank", title: TITLES[status] ?? "Error", status, detail }, "application/problem+json");

function batchId(text: string): bigint {
  if (!/^[1-9]\d*$/.test(text)) throw new HttpError(400, "A batch ID is a positive whole number.");
  return BigInt(text);
}

async function requireBatch(text: string) {
  const batch = await readBatch(batchId(text));
  if (!batch) throw new HttpError(404, `Batch ${text} does not exist.`);
  return batch;
}

async function route(request: IncomingMessage, response: ServerResponse) {
  const url = new URL(request.url ?? "/", "http://localhost");
  const path = url.pathname.replace(/\/+$/, "");
  const method = request.method ?? "GET";
  const origin = `http://${request.headers.host ?? `localhost:${PORT}`}`;

  if (method === "OPTIONS") {
    response.writeHead(204, { "access-control-allow-origin": "*", "access-control-allow-methods": "GET, HEAD, OPTIONS" });
    return response.end();
  }

  if (path === "/api/v1/documents" && method === "POST") {
    const body = await readBody(request);
    if (!body) throw new HttpError(413, `A document can be at most ${MAX_DOCUMENT_BYTES / 1024 / 1024} MiB.`);
    if (body.length === 0) throw new HttpError(400, "The document is empty.");
    const hash = hashBytes(body);
    const existing = await readDocument(hash);
    if (!existing) {
      await mkdir(DOCUMENT_DIR, { recursive: true });
      await writeFile(`${DOCUMENT_DIR}/${hash}`, body);
    }
    return send(response, existing ? 200 : 201, { hash, url: `/api/v1/documents/${hash}`, size: body.length });
  }

  if (method !== "GET" && method !== "HEAD") throw new HttpError(405, "Only GET is supported here, except POST /api/v1/documents.");

  if (path === "/api/v1/openapi.json") return send(response, 200, openApiDocument);
  if (path === "/api/v1/schemas/circularity-declaration.json") return send(response, 200, declarationSchema, "application/schema+json");

  if (path === "/api/v1/batches") {
    const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? 50) || 50, 1), 200);
    const offset = Math.max(Number(url.searchParams.get("offset") ?? 0) || 0, 0);
    const needle = (url.searchParams.get("q") ?? "").trim().toLowerCase();
    const level = url.searchParams.get("level");
    if (level && !LEVEL_NAMES.includes(level)) throw new HttpError(400, `level must be one of: ${LEVEL_NAMES.join(", ")}.`);

    const count: bigint = await (await getContract()).batchCount();
    const all = await Promise.all(Array.from({ length: Number(count) }, (_, i) => readBatch(BigInt(i + 1))));
    const matches = all.filter(
      (b): b is BatchResource =>
        b !== null &&
        (!needle || `${b.producer} ${b.materialType} ${b.origin}`.toLowerCase().includes(needle)) &&
        (!level || b.level === level),
    );
    return send(response, 200, { total: matches.length, items: matches.slice(offset, offset + limit) });
  }

  let match = path.match(/^\/api\/v1\/batches\/([^/]+)$/);
  if (match) {
    const batch = await requireBatch(match[1]);
    const wantsLd = url.searchParams.get("format") === "jsonld" || (request.headers.accept ?? "").includes("application/ld+json");
    return wantsLd ? send(response, 200, toJsonLd(batch, origin), "application/ld+json") : send(response, 200, batch);
  }

  match = path.match(/^\/api\/v1\/batches\/([^/]+)\/claims$/);
  if (match) {
    await requireBatch(match[1]);
    return send(response, 200, await readClaims(batchId(match[1])));
  }

  match = path.match(/^\/api\/v1\/batches\/([^/]+)\/circularity$/);
  if (match) {
    await requireBatch(match[1]);
    const claim = (await readClaims(batchId(match[1]))).reverse().find((c) => c.type === "CircularityInfo");
    if (!claim) throw new HttpError(404, `Batch ${match[1]} has no circularity declaration.`);

    const bytes = await readDocument(claim.documentHash);
    const verification: Verification = !bytes ? "document-missing" : hashBytes(bytes) === claim.documentHash ? "verified" : "mismatch";
    const parsed = bytes && verification === "verified" ? parseDeclaration(bytes) : null;
    return send(response, 200, {
      batchId: match[1],
      claimIndex: claim.index,
      submitter: claim.submitter,
      recordedAt: claim.timestamp,
      documentHash: claim.documentHash,
      verification,
      declaration: parsed && "declaration" in parsed ? parsed.declaration : null,
      ...(parsed && "problems" in parsed ? { problems: parsed.problems } : {}),
    });
  }

  match = path.match(/^\/api\/v1\/documents\/([^/]+)$/);
  if (match) {
    const hash = match[1].toLowerCase();
    if (!HASH.test(hash)) throw new HttpError(400, "A document hash is 0x followed by 64 hexadecimal characters.");
    const bytes = await readDocument(hash);
    if (!bytes) throw new HttpError(404, "No document is stored under this hash.");
    // Never rendered by a browser on this origin, whatever it contains.
    return send(response, 200, bytes, "application/octet-stream", {
      "cache-control": "public, max-age=31536000, immutable",
      "content-disposition": "attachment",
    });
  }

  throw new HttpError(404, "Unknown endpoint. See /api/v1/openapi.json.");
}

createServer((request, response) => {
  route(request, response).catch((error) => {
    if (error instanceof HttpError) return sendProblem(response, error.status, error.message);
    const unreachable = /ECONNREFUSED|fetch failed|NETWORK_ERROR|deployment/i.test(String((error as Error)?.message ?? error));
    if (unreachable) contract = undefined; // read the deployment again next time
    console.error(error);
    sendProblem(response, unreachable ? 502 : 500, unreachable ? "The chain is not reachable. Is the demo running?" : "Something went wrong.");
  });
}).listen(PORT, "127.0.0.1", () => console.log(`API listening on http://127.0.0.1:${PORT}/api/v1`));
