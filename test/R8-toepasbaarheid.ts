import { expect } from "chai";
import { ZeroHash } from "ethers";
import { network } from "hardhat";
import { deployPassport, Level } from "./helpers/passport.js";
import { suiteTitle } from "./helpers/requirements.js";

const { ethers, networkHelpers } = await network.create();

async function deployFixture() {
  return deployPassport(ethers);
}

describe(suiteTitle("R8"), function () {
  it("registreren lukt in één transactie met alleen de vier verplichte velden", async function () {
    const { passport, fabrikant } = await networkHelpers.loadFixture(deployFixture);
    const blockBefore = await ethers.provider.getBlockNumber();

    await passport.connect(fabrikant).registerBatch({
      materialType: "staal S355, HEA 200",
      quantity: 200n,
      unit: "stuks",
      level: Level.BuildingElement,
      origin: "",
      productionDate: 0n,
      metadataURI: "",
      metadataHash: ZeroHash,
    });

    expect(await ethers.provider.getBlockNumber()).to.equal(blockBefore + 1);
    expect(await passport.batchCount()).to.equal(1n);
  });

  // Volgt met de webapplicatie (bouwvolgorde stap 4 en 7).
  it("registreren in de app kost niet meer dan het vastgestelde aantal handelingen");
});
