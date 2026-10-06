/**
 * Document hashes. A claim stores only the keccak256 hash of a document, never
 * the document itself, so hashing happens here, in the browser: the file never
 * leaves the device.
 */
import { keccak256 } from "ethers";

export const ZERO_HASH = `0x${"0".repeat(64)}`;

export async function hashFile(file: File): Promise<string> {
  return keccak256(new Uint8Array(await file.arrayBuffer()));
}

/** A complete bytes32 value: 0x followed by exactly 64 hex characters. */
export const isHash = (value: string) => /^0x[0-9a-fA-F]{64}$/.test(value);
