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

  it("The autoimplemented fields should be set correctly", async function () {
    const registry = await ethers.deployContract("BatchRegistry");
    const [owner] = await ethers.getSigners();

    // Register batch
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

    // Read the batch back
    const id = await registry.batchCount();
    const batch = await registry.batches(id);

    // Check that the autoimplemented fields are correctly set
    expect(batch.id).to.equal(id);
    expect(batch.currentOwner).to.equal(owner.address);
    expect(batch.registeredAt).to.greaterThan(0n);
  });

  it("The event should be emitted when a batch is registered", async function () {
    const registry = await ethers.deployContract("BatchRegistry");

    // Register batch
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

    // Read the batch back
    const id = await registry.batchCount();
    const batch = await registry.batches(id);

    // Check that the event is emitted
    await expect(transaction).to.emit(registry, "BatchRegistered").withArgs(batch.id, batch.currentOwner, batch.registeredAt);
  });

  it("A second batch should have a different id than the first batch", async function () {
    const registry = await ethers.deployContract("BatchRegistry");

    // Register first batch
    const transaction1 = await registry.registerBatch(
      "Test Producer 1",
      Classification.A1,
      MaterialType.Wood,
      1000n,
      "Test Origin 1",
      1638364800n,
      SourceFile.Bim
    );
    await transaction1.wait();

    // Read batch 1 back
    const id1 = await registry.batchCount();
    const batch1 = await registry.batches(id1);

    // Register second batch
    const transaction2 = await registry.registerBatch(
      "Test Producer 2",
      Classification.A2,
      MaterialType.Metal,
      2000n,
      "Test Origin 2",
      1638364800n,
      SourceFile.Bim
    );
    await transaction2.wait();

    // Read batch 2 back
    const id2 = await registry.batchCount();
    const batch2 = await registry.batches(id2);

    // Check that the ids are different
    expect(batch1.id).to.not.equal(batch2.id);
  });

  // TODO: Add test to check if user has correct permissions to register a batch. This will require implementing a permission system in the BatchRegistry contract.
});