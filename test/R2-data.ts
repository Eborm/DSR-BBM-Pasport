import { expect } from "chai";
import { keccak256, toUtf8Bytes } from "ethers";
import { network } from "hardhat";
import { batchInput, deployPassport, Level } from "./helpers/passport.js";
import { suiteTitle } from "./helpers/requirements.js";

const { ethers, networkHelpers } = await network.create();

async function deployFixture() {
  return deployPassport(ethers);
}

describe(suiteTitle("R2"), function () {
  it("geeft alle kernvelden terug zoals ingevoerd", async function () {
    const { passport, fabrikant } = await networkHelpers.loadFixture(deployFixture);
    const input = batchInput({
      materialType: "staal S355, HEA 200",
      quantity: 200n,
      unit: "stuks",
      level: Level.BuildingElement,
      origin: "Staalfabriek Zuid-Limburg",
      productionDate: 1514764800n,
      metadataURI: "file://paspoorten/1.jsonld",
      metadataHash: keccak256(toUtf8Bytes("paspoortdocument")),
    });

    await passport.connect(fabrikant).registerBatch(input);
    const batch = await passport.getBatch(1n);

    expect(batch.materialType).to.equal(input.materialType);
    expect(batch.quantity).to.equal(input.quantity);
    expect(batch.unit).to.equal(input.unit);
    expect(batch.level).to.equal(BigInt(input.level));
    expect(batch.origin).to.equal(input.origin);
    expect(batch.productionDate).to.equal(input.productionDate);
    expect(batch.metadataURI).to.equal(input.metadataURI);
    expect(batch.registrant).to.equal(fabrikant.address);
    expect(batch.owner).to.equal(fabrikant.address);
    expect(batch.parentId).to.equal(0n);
    expect(batch.exists).to.equal(true);
  });

  it("accepteert elke materiaalsoort als vrije tekst, zonder het contract opnieuw uit te rollen", async function () {
    const { passport, fabrikant } = await networkHelpers.loadFixture(deployFixture);

    await passport.connect(fabrikant).registerBatch(batchInput({ materialType: "houtvezelisolatie", unit: "m3" }));

    expect((await passport.getBatch(1n)).materialType).to.equal("houtvezelisolatie");
  });

  it("weigert een lege materiaalsoort", async function () {
    const { passport, fabrikant } = await networkHelpers.loadFixture(deployFixture);

    await expect(
      passport.connect(fabrikant).registerBatch(batchInput({ materialType: "" })),
    ).to.be.revertedWithCustomError(passport, "EmptyMaterialType");
  });

  it("weigert hoeveelheid nul", async function () {
    const { passport, fabrikant } = await networkHelpers.loadFixture(deployFixture);

    await expect(
      passport.connect(fabrikant).registerBatch(batchInput({ quantity: 0n })),
    ).to.be.revertedWithCustomError(passport, "ZeroQuantity");
  });

  it("weigert een lege eenheid", async function () {
    const { passport, fabrikant } = await networkHelpers.loadFixture(deployFixture);

    await expect(
      passport.connect(fabrikant).registerBatch(batchInput({ unit: "" })),
    ).to.be.revertedWithCustomError(passport, "EmptyUnit");
  });

  it("weigert een niveau buiten RawMaterial, Product, Component en BuildingElement", async function () {
    const { passport, fabrikant } = await networkHelpers.loadFixture(deployFixture);

    await expect(passport.connect(fabrikant).registerBatch(batchInput({ level: 4 }))).to.revert(ethers);
  });

  it("eist een documenthash zodra er een paspoortdocument is opgegeven", async function () {
    const { passport, fabrikant } = await networkHelpers.loadFixture(deployFixture);

    await expect(
      passport.connect(fabrikant).registerBatch(batchInput({ metadataURI: "file://paspoorten/1.jsonld" })),
    ).to.be.revertedWithCustomError(passport, "EmptyHash");
  });
});
