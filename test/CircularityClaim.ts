import { expect } from "chai";
import { network } from "hardhat";

const { ethers } = await network.create();

const ClaimTypeEnum = { QualityDeclaration: 2, Registration: 3, OwnershipTransfer: 4, CircularityInfo: 5 };
const RoleEnum = { Viewer: 0, Manufacturer: 1, Inspector: 2, Owner: 3, Demolisher: 4 };

// Requirement 3: circularity and environmental data stays off-chain, only its hash is recorded.
describe("CircularityInfo claims", () => {
  let registry: any;
  let manufacturer: any;
  let inspector: any;
  let owner: any;
  let demolisher: any;
  let viewer: any;

  const BATCH_ID = 1;
  const sourceHash = ethers.keccak256(ethers.toUtf8Bytes("source document of a test batch"));
  const declarationHash = ethers.keccak256(ethers.toUtf8Bytes('{"schema":"bbm-passport/circularity-declaration/v1"}'));

  beforeEach(async function () {
    registry = await ethers.deployContract("MaterialPassport");
    let admin: any;
    [admin, manufacturer, inspector, owner, demolisher, viewer] = await ethers.getSigners();

    await registry.setRole(manufacturer.address, RoleEnum.Manufacturer);
    await registry.setRole(inspector.address, RoleEnum.Inspector);
    await registry.setRole(owner.address, RoleEnum.Owner);
    await registry.setRole(demolisher.address, RoleEnum.Demolisher);
    await registry.setRole(viewer.address, RoleEnum.Viewer);

    await registry.connect(manufacturer).registerBatch("Steelworks", 2, "Steel S355", 3, 5000, "Heerlen", 1700000000, 0, sourceHash);
  });

  it("keeps the numbers of the existing claim types unchanged", async () => {
    // The app and the stored data rely on these numbers; CircularityInfo must come after them.
    const claims = await registry.getClaims(BATCH_ID);
    expect(claims[0].claimType).to.equal(ClaimTypeEnum.Registration);
    await registry.connect(inspector).addClaim(BATCH_ID, ClaimTypeEnum.QualityDeclaration, declarationHash);
    expect((await registry.getClaims(BATCH_ID))[1].claimType).to.equal(ClaimTypeEnum.QualityDeclaration);
  });

  for (const [name, signer] of [
    ["a manufacturer", () => manufacturer],
    ["a demolisher", () => demolisher],
  ] as const) {
    it(`lets ${name} add a circularity claim`, async () => {
      await registry.connect(signer()).addClaim(BATCH_ID, ClaimTypeEnum.CircularityInfo, declarationHash);

      const claims = await registry.getClaims(BATCH_ID);
      expect(claims.length).to.equal(2);
      expect(claims[1].claimType).to.equal(ClaimTypeEnum.CircularityInfo);
      expect(claims[1].documentHash).to.equal(declarationHash);
      expect(claims[1].submitter).to.equal(signer().address);
    });
  }

  for (const [name, signer] of [
    ["an inspector", () => inspector],
    ["an owner", () => owner],
    ["a viewer", () => viewer],
  ] as const) {
    it(`refuses ${name}`, async () => {
      await expect(registry.connect(signer()).addClaim(BATCH_ID, ClaimTypeEnum.CircularityInfo, declarationHash))
        .to.be.revertedWithCustomError(registry, "NotAllowed")
        .withArgs(signer().address, ClaimTypeEnum.CircularityInfo);
    });
  }

  it("emits a ClaimAdded event with the new claim type", async () => {
    await expect(registry.connect(manufacturer).addClaim(BATCH_ID, ClaimTypeEnum.CircularityInfo, declarationHash))
      .to.emit(registry, "ClaimAdded")
      .withArgs(BATCH_ID, 1, manufacturer.address, declarationHash, ClaimTypeEnum.CircularityInfo);
  });

  it("refuses an empty hash", async () => {
    await expect(
      registry.connect(manufacturer).addClaim(BATCH_ID, ClaimTypeEnum.CircularityInfo, ethers.ZeroHash),
    ).to.be.revertedWithCustomError(registry, "EmptyHash");
  });

  it("refuses a batch that does not exist", async () => {
    await expect(registry.connect(manufacturer).addClaim(99, ClaimTypeEnum.CircularityInfo, declarationHash))
      .to.be.revertedWithCustomError(registry, "BatchNotFound")
      .withArgs(99);
  });

  it("keeps earlier declarations when a newer one is added", async () => {
    const newer = ethers.keccak256(ethers.toUtf8Bytes("an updated declaration"));
    await registry.connect(manufacturer).addClaim(BATCH_ID, ClaimTypeEnum.CircularityInfo, declarationHash);
    await registry.connect(demolisher).addClaim(BATCH_ID, ClaimTypeEnum.CircularityInfo, newer);

    const claims = await registry.getClaims(BATCH_ID);
    expect(claims.length).to.equal(3);
    expect(claims[1].documentHash).to.equal(declarationHash);
    expect(claims[2].documentHash).to.equal(newer);
  });
});
