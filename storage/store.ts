/**
 * Documentopslag buiten de keten. Op de keten staan alleen de URI en de hash;
 * het document zelf staat hier. Eén interface, zodat een lokale map later door
 * IPFS of een andere opslag kan worden vervangen zonder de rest te wijzigen.
 */
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export interface StoredDocument {
  bytes: Uint8Array;
  name: string;
  type: string;
}

export interface DocumentStore {
  /** Slaat een document op en geeft een ID terug waarmee het terug te vinden is. */
  put(document: StoredDocument): Promise<string>;
  /** Haalt een document op, of `undefined` als het ID onbekend is. */
  get(id: string): Promise<StoredDocument | undefined>;
}

const ID_PATTERN = /^[0-9a-f-]{36}$/;

/**
 * Bewaart elk document als `<id>` met de metadata in `<id>.json`. Bewust niet
 * adresseerbaar op inhoud: in de PoC kan een document op dezelfde URI worden
 * vervangen, en juist dat moet de hashcontrole op de keten aan het licht brengen.
 */
export class LocalFolderStore implements DocumentStore {
  constructor(private readonly folder: string) {}

  async put(document: StoredDocument): Promise<string> {
    const id = randomUUID();
    await mkdir(this.folder, { recursive: true });
    await writeFile(this.pathFor(id), document.bytes);
    await writeFile(`${this.pathFor(id)}.json`, JSON.stringify({ name: document.name, type: document.type }));
    return id;
  }

  async get(id: string): Promise<StoredDocument | undefined> {
    if (!ID_PATTERN.test(id)) return undefined;
    try {
      const [bytes, meta] = await Promise.all([
        readFile(this.pathFor(id)),
        readFile(`${this.pathFor(id)}.json`, "utf8"),
      ]);
      const { name, type } = JSON.parse(meta) as { name: string; type: string };
      return { bytes: new Uint8Array(bytes), name, type };
    } catch {
      return undefined;
    }
  }

  pathFor(id: string): string {
    return path.join(this.folder, id);
  }
}
