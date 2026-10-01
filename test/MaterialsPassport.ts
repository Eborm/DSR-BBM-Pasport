import { expect } from "chai";
import { network } from "hardhat";

const { ethers } = await network.create();

const RoleEnum = { Viewer: 0, Manufacturer: 1, Inspector: 2, Owner: 3, Demolisher: 4 };
const ClassificationEnum = { A1: 0, A2: 1, B: 2, C: 3, D: 4, E: 5, F: 6 };
const LevelEnum = { RawMaterial: 0, Product: 1, Component: 2, BuildingElement: 3 };
const SourceFileEnum = { Bim: 0, InspectionReport: 1, DemolitionInventory: 2 };

describe("MaterialPassport", function () {
  // Deploy the MaterialPassport contract before each test
  // owner is a Viewer and manu is a Manufacturer 
  let registry: any;
  let owner: any;
  let manu: any;
  
  beforeEach(async function () {
    registry = await ethers.deployContract("MaterialPassport");
    [owner, manu] = await ethers.getSigners();
    await registry.assignRole(manu.address, RoleEnum.Manufacturer);
  });

  it("registers a batch and stores the given values", async function () {
    // 1. execute registerBatch with testvalues
    const transaction = await registry.connect(manu).registerBatch(
      "Test Producer",
      ClassificationEnum.A1,
      "Wood",
      LevelEnum.RawMaterial,
      1000n,
      "Test Origin",
      1638364800n,
      SourceFileEnum.Bim
    );
    await transaction.wait();
    
    // 2. read the batch back with registry.batches(1n)
    const id = await registry.batchCount();
    const batch = await registry.batches(id);

    // 3. check with expect(...).to.equal(...)
    expect(batch.producer).to.equal("Test Producer");
    expect(batch.classification).to.equal(ClassificationEnum.A1);
    expect(batch.materialType).to.equal("Wood");
    expect(batch.mass).to.equal(1000n);
    expect(batch.origin).to.equal("Test Origin");
    expect(batch.productionDate).to.equal(1638364800n);
  });

  it("The autoimplemented fields should be set correctly", async function () {
    // Register batch
    const transaction = await registry.connect(manu).registerBatch(
      "Test Producer",
      ClassificationEnum.A1,
      "Wood",
      LevelEnum.RawMaterial,
      1000n,
      "Test Origin",
      1638364800n,
      SourceFileEnum.Bim
    );
    await transaction.wait();

    // Read the batch back
    const id = await registry.batchCount();
    const batch = await registry.batches(id);

    // Check that the autoimplemented fields are correctly set
    expect(batch.id).to.equal(id);
    expect(batch.currentOwner).to.equal(manu.address);
    expect(batch.registeredAt).to.greaterThan(0n);
  });

  it("The event should be emitted when a batch is registered", async function () {
    // Register batch
    const transaction = await registry.connect(manu).registerBatch(
      "Test Producer",
      ClassificationEnum.A1,
      "Wood",
      LevelEnum.RawMaterial,
      1000n,
      "Test Origin",
      1638364800n,
      SourceFileEnum.Bim
    );
    await transaction.wait();

    // Read the batch back
    const id = await registry.batchCount();
    const batch = await registry.batches(id);

    // Check that the event is emitted
    await expect(transaction).to.emit(registry, "BatchRegistered").withArgs(batch.id, batch.currentOwner, batch.registeredAt);
  });

  it("A second batch should have a different id than the first batch", async function () {
    // Register first batch
    const transaction1 = await registry.connect(manu).registerBatch(
      "Test Producer 1",
      ClassificationEnum.A1,
      "Wood",
      LevelEnum.RawMaterial,
      1000n,
      "Test Origin 1",
      1638364800n,
      SourceFileEnum.Bim
    );
    await transaction1.wait();

    // Read batch 1 back
    const id1 = await registry.batchCount();
    const batch1 = await registry.batches(id1);

    // Register second batch
    const transaction2 = await registry.connect(manu).registerBatch(
      "Test Producer 2",
      ClassificationEnum.A2,
      "Metal",
      LevelEnum.RawMaterial,
      2000n,
      "Test Origin 2",
      1638364800n,
      SourceFileEnum.Bim
    );
    await transaction2.wait();

    // Read batch 2 back
    const id2 = await registry.batchCount();
    const batch2 = await registry.batches(id2);

    // Check that the ids are different
    expect(batch1.id).to.not.equal(batch2.id);
  });

  it("Should not register a batch with invalid input", async function () {
    const transaction = registry.connect(manu).registerBatch(
      "",
      ClassificationEnum.A1, 
      "Wood", 
      LevelEnum.Product, 
      1000n, 
      "Test Origin", 
      1638364800n, 
      SourceFileEnum.Bim
    );
    
    await expect(transaction).to.be.revertedWith("Producer cannot be empty");
  });

  it("Should not register a batch if the user does not have the correct permissions", async function () {
    const transaction = registry.connect(owner).registerBatch(
        "Test Producer",
        ClassificationEnum.A1,
        "Wood",
        LevelEnum.RawMaterial,
        1000n,
        "Test Origin",
        1638364800n,
        SourceFileEnum.Bim
    );

    await expect(transaction).to.be.revertedWith("Caller does not have the required role");
  });
});