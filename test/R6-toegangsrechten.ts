import { expect } from "chai";
import { keccak256, toUtf8Bytes } from "ethers";
import { network } from "hardhat";
import { batchInput, deployPassport, kind, timeline } from "./helpers/passport.js";
import { suiteTitle } from "./helpers/requirements.js";

const { ethers, networkHelpers } = await network.create();

const bewijs = keccak256(toUtf8Bytes("document"));
const uri = "file://documenten/bewijs.pdf";

/** Batch 1 is van de fabrikant, batch 2 is overgedragen aan de aannemer. */
async function batchesFixture() {
  const actors = await deployPassport(ethers);
  const { passport, fabrikant, aannemer } = actors;
  await passport.connect(fabrikant).registerBatch(batchInput());
  await passport.connect(fabrikant).registerBatch(batchInput());
  await passport.connect(fabrikant).transferOwnership(2n, aannemer.address, 200n);
  return actors;
}

describe(suiteTitle("R6"), function () {
  describe("zonder rol", function () {
    it("mag alle batches en de volledige tijdlijn lezen", async function () {
      const { passport, buitenstaander } = await networkHelpers.loadFixture(batchesFixture);
      const reader = passport.connect(buitenstaander);

      expect(await reader.batchCount()).to.equal(2n);
      expect((await reader.getBatch(1n)).materialType).to.equal("staal S355, HEA 200");
      expect(await timeline(reader, 2n)).to.have.length(2);
    });

    it("mag niets schrijven: registreren, claimen, overdragen en splitsen worden geweigerd", async function () {
      const { passport, buitenstaander, architect } = await networkHelpers.loadFixture(batchesFixture);
      const writer = passport.connect(buitenstaander);

      await expect(writer.registerBatch(batchInput()))
        .to.be.revertedWithCustomError(passport, "AccessControlUnauthorizedAccount")
        .withArgs(buitenstaander.address, await passport.MANUFACTURER());
      await expect(writer.addClaim(1n, kind("inspection"), bewijs, uri, "")).to.be.revertedWithCustomError(
        passport,
        "AccessControlUnauthorizedAccount",
      );
      await expect(writer.transferOwnership(1n, architect.address, 200n)).to.be.revertedWithCustomError(
        passport,
        "NotAllowedToTransfer",
      );
      await expect(writer.splitBatch(1n, 50n, architect.address)).to.be.revertedWithCustomError(
        passport,
        "AccessControlUnauthorizedAccount",
      );
    });

    it("kan geen batch ontvangen, want dan kan niemand hem nog overdragen of splitsen", async function () {
      const { passport, fabrikant, aannemer, buitenstaander } = await networkHelpers.loadFixture(batchesFixture);

      await expect(passport.connect(fabrikant).transferOwnership(1n, buitenstaander.address, 200n))
        .to.be.revertedWithCustomError(passport, "RecipientWithoutOwnerRole")
        .withArgs(buitenstaander.address);
      await expect(passport.connect(aannemer).splitBatch(2n, 50n, buitenstaander.address))
        .to.be.revertedWithCustomError(passport, "RecipientWithoutOwnerRole")
        .withArgs(buitenstaander.address);
    });

    it("mag zichzelf geen rol toekennen", async function () {
      const { passport, buitenstaander } = await networkHelpers.loadFixture(batchesFixture);

      await expect(
        passport.connect(buitenstaander).grantRole(await passport.MANUFACTURER(), buitenstaander.address),
      ).to.be.revertedWithCustomError(passport, "AccessControlUnauthorizedAccount");
    });
  });

  describe("MANUFACTURER", function () {
    it("mag batches aanmaken", async function () {
      const { passport, fabrikant } = await networkHelpers.loadFixture(batchesFixture);

      await passport.connect(fabrikant).registerBatch(batchInput());

      expect(await passport.batchCount()).to.equal(3n);
    });

    it("mag een eigen batch overdragen", async function () {
      const { passport, fabrikant, aannemer } = await networkHelpers.loadFixture(batchesFixture);

      await passport.connect(fabrikant).transferOwnership(1n, aannemer.address, 200n);

      expect((await passport.getBatch(1n)).owner).to.equal(aannemer.address);
    });

    it("mag een batch van een ander niet overdragen", async function () {
      const { passport, fabrikant, architect } = await networkHelpers.loadFixture(batchesFixture);

      await expect(passport.connect(fabrikant).transferOwnership(2n, architect.address, 200n))
        .to.be.revertedWithCustomError(passport, "NotOwner")
        .withArgs(2n, fabrikant.address);
    });

    it("mag geen keuring toevoegen", async function () {
      const { passport, fabrikant } = await networkHelpers.loadFixture(batchesFixture);

      await expect(
        passport.connect(fabrikant).addClaim(1n, kind("inspection"), bewijs, uri, ""),
      ).to.be.revertedWithCustomError(passport, "AccessControlUnauthorizedAccount");
    });
  });

  describe("INSPECTOR", function () {
    it("mag een keuring toevoegen aan elke batch, ongeacht de eigenaar", async function () {
      const { passport, keurder } = await networkHelpers.loadFixture(batchesFixture);

      await passport.connect(keurder).addClaim(1n, kind("inspection"), bewijs, uri, "Goedgekeurd");
      await passport.connect(keurder).addClaim(2n, kind("inspection"), bewijs, uri, "Goedgekeurd");

      expect((await timeline(passport, 1n)).at(-1)!.actor).to.equal(keurder.address);
      expect((await timeline(passport, 2n)).at(-1)!.actor).to.equal(keurder.address);
    });

    it("mag geen eigenaar worden", async function () {
      const { passport, fabrikant, keurder } = await networkHelpers.loadFixture(batchesFixture);

      await expect(passport.connect(fabrikant).transferOwnership(1n, keurder.address, 200n))
        .to.be.revertedWithCustomError(passport, "InspectorCannotOwn")
        .withArgs(keurder.address);
    });

    it("mag ook als fabrikant geen batch aanmaken, want dan wordt hij eigenaar", async function () {
      const { passport, keurder } = await networkHelpers.loadFixture(batchesFixture);
      await passport.grantRole(await passport.MANUFACTURER(), keurder.address);

      await expect(passport.connect(keurder).registerBatch(batchInput()))
        .to.be.revertedWithCustomError(passport, "InspectorCannotOwn")
        .withArgs(keurder.address);
    });

    it("mag geen plaatsing claimen", async function () {
      const { passport, keurder } = await networkHelpers.loadFixture(batchesFixture);

      await expect(
        passport.connect(keurder).addClaim(2n, kind("placement"), bewijs, uri, ""),
      ).to.be.revertedWithCustomError(passport, "AccessControlUnauthorizedAccount");
    });
  });

  describe("OWNER", function () {
    it("mag locatie en status claimen op een eigen batch", async function () {
      const { passport, aannemer } = await networkHelpers.loadFixture(batchesFixture);

      await passport.connect(aannemer).addClaim(2n, kind("placement"), bewijs, uri, "Geplaatst");

      expect((await timeline(passport, 2n)).at(-1)!.kind).to.equal(kind("placement"));
    });

    it("mag niet claimen op een batch van een ander", async function () {
      const { passport, aannemer } = await networkHelpers.loadFixture(batchesFixture);

      await expect(passport.connect(aannemer).addClaim(1n, kind("placement"), bewijs, uri, ""))
        .to.be.revertedWithCustomError(passport, "NotOwner")
        .withArgs(1n, aannemer.address);
    });

    it("mag een eigen batch overdragen en splitsen", async function () {
      const { passport, aannemer, architect } = await networkHelpers.loadFixture(batchesFixture);

      await passport.connect(aannemer).splitBatch(2n, 50n, architect.address);
      await passport.connect(aannemer).transferOwnership(2n, architect.address, 150n);

      expect((await passport.getBatch(2n)).owner).to.equal(architect.address);
      expect((await passport.getBatch(3n)).owner).to.equal(architect.address);
    });

    it("mag een batch van een ander niet splitsen", async function () {
      const { passport, architect } = await networkHelpers.loadFixture(batchesFixture);

      await expect(passport.connect(architect).splitBatch(2n, 50n, architect.address))
        .to.be.revertedWithCustomError(passport, "NotOwner")
        .withArgs(2n, architect.address);
    });

    it("mag geen batches aanmaken", async function () {
      const { passport, aannemer } = await networkHelpers.loadFixture(batchesFixture);

      await expect(passport.connect(aannemer).registerBatch(batchInput())).to.be.revertedWithCustomError(
        passport,
        "AccessControlUnauthorizedAccount",
      );
    });
  });

  describe("DEMOLISHER", function () {
    it("mag de conditie bij demontage claimen", async function () {
      const { passport, sloper } = await networkHelpers.loadFixture(batchesFixture);

      await passport.connect(sloper).addClaim(2n, kind("demolition"), bewijs, uri, "Gedemonteerd, goede staat");

      expect((await timeline(passport, 2n)).at(-1)!.kind).to.equal(kind("demolition"));
    });

    it("mag geen keuring toevoegen en geen batches aanmaken", async function () {
      const { passport, sloper } = await networkHelpers.loadFixture(batchesFixture);

      await expect(
        passport.connect(sloper).addClaim(2n, kind("inspection"), bewijs, uri, ""),
      ).to.be.revertedWithCustomError(passport, "AccessControlUnauthorizedAccount");
      await expect(passport.connect(sloper).registerBatch(batchInput())).to.be.revertedWithCustomError(
        passport,
        "AccessControlUnauthorizedAccount",
      );
    });
  });

  describe("omzeilen", function () {
    it("een directe ERC-1155-overdracht buiten de rolcontrole om wordt geweigerd", async function () {
      const { passport, aannemer, buitenstaander } = await networkHelpers.loadFixture(batchesFixture);

      await expect(
        passport.connect(aannemer).safeTransferFrom(aannemer.address, buitenstaander.address, 2n, 200n, "0x"),
      ).to.be.revertedWithCustomError(passport, "DirectTransferDisabled");
      await expect(
        passport
          .connect(aannemer)
          .safeBatchTransferFrom(aannemer.address, buitenstaander.address, [2n], [200n], "0x"),
      ).to.be.revertedWithCustomError(passport, "DirectTransferDisabled");
    });
  });

  describe("beheer", function () {
    it("het contract kan niet zonder beheerder worden uitgerold, anders kan niemand rollen toekennen", async function () {
      const factory = await ethers.getContractFactory("MaterialPassport");

      await expect(factory.deploy(ethers.ZeroAddress)).to.be.revertedWithCustomError(factory, "ZeroAddress");
    });
  });
});
