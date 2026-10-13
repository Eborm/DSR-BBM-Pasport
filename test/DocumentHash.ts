import { expect } from "chai";
import { keccak256 } from "ethers";

/**
 * A claim stores only the keccak256 hash of a document, so verification is only
 * trustworthy if changing the document always changes the hash. These tests check
 * that for single-byte changes.
 */

// This test suite tests Requirement 5 (integrity): the hash of a document is stored in the blockchain, 
// so it cannot be changed without changing the document itself.
describe("document hash", () => {
    // A small document with every possible byte value in it, so no value is special-cased.
    const sample = Uint8Array.from({ length: 256 }, (_, i) => i);

    it("returns a valid bytes32 hash", () => {
        expect(keccak256(sample)).to.match(/^0x[0-9a-f]{64}$/);
    });

    it("returns the same hash for the same content", () => {
        expect(keccak256(sample.slice())).to.equal(keccak256(sample));
    });

    it("returns a different hash when any single byte is changed to any other value", () => {
        const original = keccak256(sample);
        const seen = new Set([original]);

        for (let position = 0; position < sample.length; position++) {
            for (let value = 0; value < 256; value++) {
                if (value === sample[position]) continue;

                const changed = sample.slice();
                changed[position] = value;
                const hash = keccak256(changed);

                expect(hash, `byte ${position} set to ${value}`).to.not.equal(original);
                // Stronger: no two different variants may collide with each other either.
                expect(seen.has(hash), `collision at byte ${position}, value ${value}`).to.equal(false);
                seen.add(hash);
            }
        }
        // 256 positions x 255 other values, plus the original.
        expect(seen.size).to.equal(256 * 255 + 1);
    });

    it("returns a different hash when a byte is added or removed", () => {
        const hashes = [
            keccak256(sample),
            keccak256(Uint8Array.from([...sample, 0])), // appended
            keccak256(Uint8Array.from([0, ...sample])), // prepended
            keccak256(sample.slice(0, -1)), // last byte removed
            keccak256(sample.slice(1)), // first byte removed
        ];
        expect(new Set(hashes).size).to.equal(hashes.length);
    });
});