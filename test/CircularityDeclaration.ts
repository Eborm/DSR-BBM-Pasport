import { expect } from "chai";
import {
  DECLARATION_SCHEMA,
  canonicalize,
  declarationBytes,
  hashBytes,
  parseDeclaration,
  validateDeclaration,
  type CircularityDeclaration,
} from "../app/src/lib/circularity";

// Requirement 3: the declaration is an off-chain document, so its rules and its hash must be the same everywhere.
describe("circularity declaration", () => {
  const valid: CircularityDeclaration = {
    schema: DECLARATION_SCHEMA,
    batchId: "1",
    reusablePercent: 90,
    recyclablePercent: 98,
    repairability: "good",
    recycledContentPercent: 85,
    residualValueEur: 2500,
    nextApplications: ["Reuse as a structural beam"],
    environment: { gwpA1A3KgCo2ePerKg: 0.85 },
  };

  describe("validation", () => {
    it("accepts a complete declaration, with or without an EPD hash", () => {
      expect(validateDeclaration(valid)).to.deep.equal([]);
      const withEpd = { ...valid, environment: { ...valid.environment, epdHash: "0x" + "ab".repeat(32) } };
      expect(validateDeclaration(withEpd)).to.deep.equal([]);
    });

    const broken: [string, (d: any) => void][] = [
      ["a percentage above 100", (d) => (d.reusablePercent = 101)],
      ["a negative percentage", (d) => (d.recyclablePercent = -1)],
      ["a negative CO2 value", (d) => (d.environment.gwpA1A3KgCo2ePerKg = -0.1)],
      ["a negative residual value", (d) => (d.residualValueEur = -5)],
      ["an unknown repairability", (d) => (d.repairability = "perfect")],
      ["no next applications", (d) => (d.nextApplications = [])],
      ["a blank next application", (d) => (d.nextApplications = ["  "])],
      ["too many next applications", (d) => (d.nextApplications = Array(11).fill("Reuse"))],
      ["another schema", (d) => (d.schema = "other/v1")],
      ["a batch ID of zero", (d) => (d.batchId = "0")],
      ["a malformed EPD hash", (d) => (d.environment.epdHash = "0x1234")],
      ["a missing environment", (d) => delete d.environment],
    ];
    for (const [name, break_] of broken) {
      it(`refuses ${name}`, () => {
        const copy = JSON.parse(JSON.stringify(valid));
        break_(copy);
        expect(validateDeclaration(copy)).to.not.be.empty;
      });
    }

    it("refuses something that is not an object", () => {
      for (const value of [null, "text", 5, []]) expect(validateDeclaration(value)).to.not.be.empty;
    });
  });

  describe("canonical form and hash", () => {
    it("sorts keys and leaves out whitespace and undefined values", () => {
      expect(canonicalize({ b: 1, a: [2, { d: 1, c: undefined }], e: "x" })).to.equal('{"a":[2,{"d":1}],"b":1,"e":"x"}');
    });

    it("gives the same hash whatever the order of the keys", () => {
      const reordered = Object.fromEntries(Object.entries(valid).reverse()) as unknown as CircularityDeclaration;
      expect(hashBytes(declarationBytes(reordered))).to.equal(hashBytes(declarationBytes(valid)));
    });

    it("gives another hash when any value changes", () => {
      const changed = { ...valid, reusablePercent: 91 };
      expect(hashBytes(declarationBytes(changed))).to.not.equal(hashBytes(declarationBytes(valid)));
    });
  });

  describe("reading stored bytes", () => {
    it("returns the declaration that was stored", () => {
      const parsed = parseDeclaration(declarationBytes(valid));
      expect(parsed).to.deep.equal({ declaration: valid });
    });

    it("explains why bytes are not a declaration", () => {
      expect(parseDeclaration(new TextEncoder().encode("not json"))).to.have.property("problems");
      expect(parseDeclaration(new TextEncoder().encode('{"schema":"x"}'))).to.have.property("problems");
    });
  });
});
