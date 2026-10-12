import { expect } from "chai";
import { network } from "hardhat";

const { ethers } = await network.create();

const RoleEnum = { Viewer: 0, Manufacturer: 1, Inspector: 2, Owner: 3, Demolisher: 4 };
const ClassificationEnum = { A1: 0, A2: 1, B: 2, C: 3, D: 4, E: 5, F: 6 };
const LevelEnum = { RawMaterial: 0, Product: 1, Component: 2, BuildingElement: 3 };
const SourceFileEnum = { Bim: 0, InspectionReport: 1, DemolitionInventory: 2 };
const ClaimTypeEnum = { StatusChange: 0, LocationChange: 1, QualityDeclaration: 2, Registration: 3, OwnershipTransfer: 4 };
// Stand-in for the keccak256 of a source document
const DOC_HASH = ethers.keccak256(ethers.toUtf8Bytes("test source document"));
const TRANSFER_HASH = ethers.keccak256(ethers.toUtf8Bytes("test transfer document"));

describe("BatchRegistry", function () {
  // Deploy the MaterialPassport contract before each test
  let registry: any;
  let owner: any;
  let manufacturer: any;
  let buyer: any;
  let demolisher: any;
  let stranger: any;
  
  beforeEach(async function () {
    registry = await ethers.deployContract("MaterialPassport");
    [owner, manufacturer, buyer, demolisher, stranger] = await ethers.getSigners();
    await registry.setRole(manufacturer.address, RoleEnum.Manufacturer);
    await registry.setRole(buyer.address, RoleEnum.Owner);
    await registry.setRole(demolisher.address, RoleEnum.Demolisher);
  });

  async function registerOne() {
    await (await registry.connect(manufacturer).registerBatch(
      "Test Producer", ClassificationEnum.A1, "Wood", LevelEnum.RawMaterial,
      1000n, "Test Origin", 1638364800n, SourceFileEnum.Bim, DOC_HASH
    )).wait();
    return await registry.batchCount();
  }

  it("registers a batch and stores the given values", async function () {
    // 1. execute registerBatch with testvalues
    const transaction = await registry.connect(manufacturer).registerBatch(
      "Test Producer",
      ClassificationEnum.A1,
      "Wood",
      LevelEnum.RawMaterial,
      1000n,
      "Test Origin",
      1638364800n,
      SourceFileEnum.Bim,
      DOC_HASH
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
    const transaction = await registry.connect(manufacturer).registerBatch(
      "Test Producer",
      ClassificationEnum.A1,
      "Wood",
      LevelEnum.RawMaterial,
      1000n,
      "Test Origin",
      1638364800n,
      SourceFileEnum.Bim,
      DOC_HASH
    );
    await transaction.wait();

    // Read the batch back
    const id = await registry.batchCount();
    const batch = await registry.batches(id);

    // Check that the autoimplemented fields are correctly set
    expect(batch.id).to.equal(id);
    expect(batch.currentOwner).to.equal(manufacturer.address);
    expect(batch.registeredAt).to.greaterThan(0n);
  });

  it("The event should be emitted when a batch is registered", async function () {
    // Register batch
    const transaction = await registry.connect(manufacturer).registerBatch(
      "Test Producer",
      ClassificationEnum.A1,
      "Wood",
      LevelEnum.RawMaterial,
      1000n,
      "Test Origin",
      1638364800n,
      SourceFileEnum.Bim,
      DOC_HASH
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
    const transaction1 = await registry.connect(manufacturer).registerBatch(
      "Test Producer 1",
      ClassificationEnum.A1,
      "Wood",
      LevelEnum.RawMaterial,
      1000n,
      "Test Origin 1",
      1638364800n,
      SourceFileEnum.Bim,
      DOC_HASH
    );
    await transaction1.wait();

    // Read batch 1 back
    const id1 = await registry.batchCount();
    const batch1 = await registry.batches(id1);

    // Register second batch
    const transaction2 = await registry.connect(manufacturer).registerBatch(
      "Test Producer 2",
      ClassificationEnum.A2,
      "Metal",
      LevelEnum.RawMaterial,
      2000n,
      "Test Origin 2",
      1638364800n,
      SourceFileEnum.Bim,
      DOC_HASH
    );
    await transaction2.wait();

    // Read batch 2 back
    const id2 = await registry.batchCount();
    const batch2 = await registry.batches(id2);

    // Check that the ids are different
    expect(batch1.id).to.not.equal(batch2.id);
  });

  it("Should not register a batch with invalid input", async function () {
    const transaction = registry.connect(manufacturer).registerBatch(
      "",
      ClassificationEnum.A1, 
      "Wood", 
      LevelEnum.Product, 
      1000n, 
      "Test Origin", 
      1638364800n, 
      SourceFileEnum.Bim,
      DOC_HASH
    );
    
    await expect(transaction).to.be.revertedWithCustomError(registry, "EmptyProducer");
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
        SourceFileEnum.Bim,
      DOC_HASH
    );

    await expect(transaction).to.be.revertedWithCustomError(registry, "WrongRole");
  });

  describe("registration claim", function () {
    it("writes a Registration claim with the document hash when a batch is registered", async function () {
      const id = await registerOne();
      const list = await registry.getClaims(id);
      expect(list.length).to.equal(1);
      expect(list[0].claimType).to.equal(ClaimTypeEnum.Registration);
      expect(list[0].documentHash).to.equal(DOC_HASH);
      expect(list[0].submitter).to.equal(manufacturer.address);
    });

    it("refuses to register a batch without a document hash", async function () {
      await expect(
        registry.connect(manufacturer).registerBatch(
          "Test Producer", ClassificationEnum.A1, "Wood", LevelEnum.RawMaterial,
          1000n, "Test Origin", 1638364800n, SourceFileEnum.Bim, ethers.ZeroHash
        )
      ).to.be.revertedWithCustomError(registry, "EmptyHash");
    });

    it("does not let anyone add a Registration or OwnershipTransfer claim by hand", async function () {
      const id = await registerOne();
      for (const type of [ClaimTypeEnum.Registration, ClaimTypeEnum.OwnershipTransfer]) {
        await expect(registry.connect(buyer).addClaim(id, type, DOC_HASH))
          .to.be.revertedWithCustomError(registry, "NotAllowed");
      }
    });
  });

  describe("ownership transfer", function () {
    it("moves the batch to the new owner and emits an event", async function () {
      const id = await registerOne();
      await expect(registry.connect(manufacturer).transferOwnership(id, buyer.address, TRANSFER_HASH))
        .to.emit(registry, "OwnershipTransferred").withArgs(id, manufacturer.address, buyer.address);
      expect((await registry.batches(id)).currentOwner).to.equal(buyer.address);
    });

    it("records the transfer as an OwnershipTransfer claim", async function () {
      const id = await registerOne();
      await registry.connect(manufacturer).transferOwnership(id, buyer.address, TRANSFER_HASH);
      const list = await registry.getClaims(id);
      expect(list.length).to.equal(2);
      expect(list[1].claimType).to.equal(ClaimTypeEnum.OwnershipTransfer);
      expect(list[1].documentHash).to.equal(TRANSFER_HASH);
      expect(list[1].submitter).to.equal(manufacturer.address);
    });

    it("lets the new owner pass the batch on (Owner to Demolisher)", async function () {
      const id = await registerOne();
      await registry.connect(manufacturer).transferOwnership(id, buyer.address, TRANSFER_HASH);
      await registry.connect(buyer).transferOwnership(id, demolisher.address, TRANSFER_HASH);
      expect((await registry.batches(id)).currentOwner).to.equal(demolisher.address);
    });

    it("refuses a transfer from someone who is not the current owner", async function () {
      const id = await registerOne();
      await expect(registry.connect(stranger).transferOwnership(id, buyer.address, TRANSFER_HASH))
        .to.be.revertedWithCustomError(registry, "NotAllowed").withArgs(stranger.address, ClaimTypeEnum.OwnershipTransfer);
      // the old owner can no longer transfer after handing over
      await registry.connect(manufacturer).transferOwnership(id, buyer.address, TRANSFER_HASH);
      await expect(registry.connect(manufacturer).transferOwnership(id, demolisher.address, TRANSFER_HASH))
        .to.be.revertedWithCustomError(registry, "NotAllowed").withArgs(manufacturer.address, ClaimTypeEnum.OwnershipTransfer);
    });

    it("refuses a batch that does not exist", async function () {
      await expect(registry.connect(manufacturer).transferOwnership(99n, buyer.address, TRANSFER_HASH))
        .to.be.revertedWithCustomError(registry, "BatchNotFound").withArgs(99n);
    });

    it("refuses invalid recipients", async function () {
      const id = await registerOne();
      await expect(registry.connect(manufacturer).transferOwnership(id, ethers.ZeroAddress, TRANSFER_HASH))
        .to.be.revertedWithCustomError(registry, "InvalidOwner").withArgs("New owner cannot be zero address");
      await expect(registry.connect(manufacturer).transferOwnership(id, manufacturer.address, TRANSFER_HASH))
        .to.be.revertedWithCustomError(registry, "InvalidOwner").withArgs("New owner cannot be the current owner");
      // stranger has no role, manufacturers and inspectors cannot receive batches
      await expect(registry.connect(manufacturer).transferOwnership(id, stranger.address, TRANSFER_HASH))
        .to.be.revertedWithCustomError(registry, "NotAllowed").withArgs(manufacturer.address, ClaimTypeEnum.OwnershipTransfer);
    });

    it("refuses a transfer without a document hash", async function () {
      const id = await registerOne();
      await expect(registry.connect(manufacturer).transferOwnership(id, buyer.address, ethers.ZeroHash))
        .to.be.revertedWithCustomError(registry, "EmptyHash");
    });
  });
});
