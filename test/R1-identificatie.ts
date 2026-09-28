import { expect } from "chai";
import { network } from "hardhat";
import { batchInput, deployPassport, kind, timeline } from "./helpers/passport.js";
import { suiteTitle } from "./helpers/requirements.js";

const { ethers, networkHelpers } = await network.create();

async function deployFixture() {
  return deployPassport(ethers);
}

describe(suiteTitle("R1"), function () {
  it("kent elke nieuwe batch een uniek, oplopend ID toe, beginnend bij 1", async function () {
    const { passport, fabrikant } = await networkHelpers.loadFixture(deployFixture);

    for (const materialType of ["staal S355, HEA 200", "beton C30/37", "kalkzandsteen"]) {
      await passport.connect(fabrikant).registerBatch(batchInput({ materialType }));
    }

    expect(await passport.batchCount()).to.equal(3n);
    expect((await passport.getBatch(1n)).materialType).to.equal("staal S355, HEA 200");
    expect((await passport.getBatch(2n)).materialType).to.equal("beton C30/37");
    expect((await passport.getBatch(3n)).materialType).to.equal("kalkzandsteen");
  });

  it("weigert het opvragen van een onbekend ID met UnknownBatch", async function () {
    const { passport, fabrikant } = await networkHelpers.loadFixture(deployFixture);
    await passport.connect(fabrikant).registerBatch(batchInput());

    await expect(passport.getBatch(0n)).to.be.revertedWithCustomError(passport, "UnknownBatch").withArgs(0n);
    await expect(passport.getBatch(2n)).to.be.revertedWithCustomError(passport, "UnknownBatch").withArgs(2n);
  });

  it("geeft een afgesplitste batch een eigen ID dat terugverwijst naar de oorsprong", async function () {
    const { passport, fabrikant, aannemer, architect } = await networkHelpers.loadFixture(deployFixture);
    await passport.connect(fabrikant).registerBatch(batchInput());
    await passport.connect(fabrikant).transferOwnership(1n, aannemer.address, 200n);

    await passport.connect(aannemer).splitBatch(1n, 50n, architect.address);

    const child = await passport.getBatch(2n);
    expect(child.id).to.equal(2n);
    expect(child.parentId).to.equal(1n);
    expect((await passport.getBatch(1n)).parentId).to.equal(0n);
  });

  it("volgt de huidige eigenaar en legt elke overdracht vast op de tijdlijn", async function () {
    const { passport, fabrikant, aannemer, architect } = await networkHelpers.loadFixture(deployFixture);
    await passport.connect(fabrikant).registerBatch(batchInput());

    expect((await passport.getBatch(1n)).owner).to.equal(fabrikant.address);
    await passport.connect(fabrikant).transferOwnership(1n, aannemer.address, 200n);
    await passport.connect(aannemer).transferOwnership(1n, architect.address, 200n);
    expect((await passport.getBatch(1n)).owner).to.equal(architect.address);

    const transfers = (await timeline(passport, 1n)).filter((line) => line.kind === kind("transfer"));
    expect(transfers.map((line) => line.actor)).to.deep.equal([fabrikant.address, aannemer.address]);
  });

  it("weigert het nuladres als nieuwe eigenaar, want dan is de batch niet meer te volgen", async function () {
    const { passport, fabrikant, aannemer } = await networkHelpers.loadFixture(deployFixture);
    await passport.connect(fabrikant).registerBatch(batchInput());

    await expect(
      passport.connect(fabrikant).transferOwnership(1n, ethers.ZeroAddress, 200n),
    ).to.be.revertedWithCustomError(passport, "ZeroAddress");

    await passport.connect(fabrikant).transferOwnership(1n, aannemer.address, 200n);
    await expect(
      passport.connect(aannemer).splitBatch(1n, 50n, ethers.ZeroAddress),
    ).to.be.revertedWithCustomError(passport, "ZeroAddress");
  });

  it("houdt de hoeveelheid kloppend: overdragen gaat per hele batch, splitsen alleen met een deel", async function () {
    const { passport, fabrikant, aannemer, architect } = await networkHelpers.loadFixture(deployFixture);
    await passport.connect(fabrikant).registerBatch(batchInput());

    await expect(passport.connect(fabrikant).transferOwnership(1n, aannemer.address, 50n))
      .to.be.revertedWithCustomError(passport, "InvalidAmount")
      .withArgs(50n, 200n);

    await passport.connect(fabrikant).transferOwnership(1n, aannemer.address, 200n);
    const splitter = passport.connect(aannemer);
    await expect(splitter.splitBatch(1n, 0n, architect.address)).to.be.revertedWithCustomError(passport, "ZeroQuantity");
    await expect(splitter.splitBatch(1n, 200n, architect.address))
      .to.be.revertedWithCustomError(passport, "InvalidAmount")
      .withArgs(200n, 200n);
    await expect(splitter.splitBatch(1n, 201n, architect.address))
      .to.be.revertedWithCustomError(passport, "InvalidAmount")
      .withArgs(201n, 200n);

    expect((await passport.getBatch(1n)).quantity).to.equal(200n);
    expect(await passport.batchCount()).to.equal(1n);
  });
});
