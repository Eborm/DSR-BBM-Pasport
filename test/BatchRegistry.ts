import { expect } from "chai";
import { network } from "hardhat";
import { Classification } from "../enums/Classification.js";
import { MaterialType } from "../enums/MaterialType.js";
import { SourceFile } from "../enums/SourceFile.js";

const { ethers } = await network.create();

describe("BatchRegistry", function () {
  it("registers a batch and stores the given values", async function () {
    const registry = await ethers.deployContract("BatchRegistry");

    // 1. execute registerBatch with testvalues
    const transaction = await registry.registerBatch(
      "Test Producer",
      Classification.A1,
      MaterialType.Wood,
      1000n,
      "Test Origin",
      1638364800n,
      SourceFile.Bim
    );
    await transaction.wait();
    
    // 2. read the batch back with registry.batches(1n)
    const id = await registry.batchCount();
    const batch = await registry.batches(id);

    // 3. check with expect(...).to.equal(...)
    expect(batch.producer).to.equal("Test Producer");
    expect(batch.classification).to.equal(Classification.A1);
    expect(batch.materialType).to.equal(MaterialType.Wood);
    expect(batch.mass).to.equal(1000n);
    expect(batch.origin).to.equal("Test Origin");
    expect(batch.installationDate).to.equal(1638364800n);
  });
});