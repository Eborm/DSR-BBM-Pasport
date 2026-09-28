/**
 * HTTP-toegang tot de documentopslag.
 *
 *   POST /documents        body = ruwe bytes, header x-filename → { uri }
 *   GET  /documents/<id>   → de bytes, met naam in x-filename
 *
 * Geen authenticatie: in de PoC is elk document leesbaar voor wie de URI kent
 * (zie README, beveiligbaarheid van de documentlaag).
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import path from "node:path";
import { LocalFolderStore } from "./store.js";

export const STORAGE_PORT = Number(process.env.STORAGE_PORT ?? 8787);
export const STORAGE_FOLDER = path.resolve(process.env.STORAGE_FOLDER ?? "storage/data");
const PUBLIC_URL = process.env.STORAGE_PUBLIC_URL ?? `http://localhost:${STORAGE_PORT}`;
const MAX_BYTES = 25 * 1024 * 1024;

const store = new LocalFolderStore(STORAGE_FOLDER);

function cors(response: ServerResponse) {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "content-type, x-filename");
  response.setHeader("Access-Control-Expose-Headers", "x-filename, content-type");
}

async function readBody(request: IncomingMessage): Promise<Uint8Array> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    size += (chunk as Buffer).length;
    if (size > MAX_BYTES) throw new Error("Document is groter dan 25 MB");
    chunks.push(chunk as Buffer);
  }
  return new Uint8Array(Buffer.concat(chunks));
}

function send(response: ServerResponse, status: number, body: unknown) {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

const server = createServer(async (request, response) => {
  cors(response);
  const url = new URL(request.url ?? "/", PUBLIC_URL);

  try {
    if (request.method === "OPTIONS") {
      response.writeHead(204).end();
    } else if (request.method === "POST" && url.pathname === "/documents") {
      const bytes = await readBody(request);
      const name = decodeURIComponent(String(request.headers["x-filename"] ?? "document"));
      const type = request.headers["content-type"] ?? "application/octet-stream";
      const id = await store.put({ bytes, name, type });
      console.log(`opgeslagen  ${id}  ${name} (${bytes.length} bytes)`);
      send(response, 201, { uri: `${PUBLIC_URL}/documents/${id}` });
    } else if (request.method === "GET" && url.pathname.startsWith("/documents/")) {
      const document = await store.get(url.pathname.slice("/documents/".length));
      if (!document) return send(response, 404, { error: "Document niet gevonden" });
      response.writeHead(200, {
        "content-type": document.type,
        "content-length": document.bytes.length,
        "content-disposition": `inline; filename*=UTF-8''${encodeURIComponent(document.name)}`,
        "x-filename": encodeURIComponent(document.name),
        "cache-control": "no-store",
      });
      response.end(document.bytes);
    } else {
      send(response, 404, { error: "Onbekend pad" });
    }
  } catch (error) {
    send(response, 400, { error: (error as Error).message });
  }
});

server.listen(STORAGE_PORT, () => {
  console.log(`Documentopslag op ${PUBLIC_URL} (map: ${STORAGE_FOLDER})`);
});
