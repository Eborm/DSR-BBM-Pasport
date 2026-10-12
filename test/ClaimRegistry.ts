import { expect } from "chai";
import { network} from "hardhat";

const { ethers } = await network.create();

const ClaimTypeEnum = { StatusChange: 0, LocationChange: 1, QualityDeclaration: 2 };
const RoleEnum = { Viewer: 0, Manufacturer: 1, Inspector: 2, Owner: 3, Demolisher: 4 };

// This test suite tests Reuirement 5 (integrity and reliability): information about who submitted a claim and 
// when is stored in the blockchain, so it cannot be changed without changing the blockchain itself.
// This test suite also tests requirement 6 (access control): only certain roles are allowed to add certain types of claims.
describe("ClaimRegistry", () => {
  let registry: any;
  let admin: any;
  let manufacturer: any;
  let owner: any;
  let inspector: any;
  let demolisher: any;
  let viewer: any;
  let stranger: any;

  const BATCH_ID = 1;
  const hash = ethers.keccak256(ethers.toUtf8Bytes("content of a test inspection report"));
  const sourceHash = ethers.keccak256(ethers.toUtf8Bytes("source document of a test batch"));

  // Fresh contract + one wallet per role, before every test.
  beforeEach(async function () {
    registry = await ethers.deployContract("MaterialPassport");
    [admin, manufacturer, owner, inspector, demolisher, viewer, stranger] = await ethers.getSigners();
    
    await registry.setRole(manufacturer.address, RoleEnum.Manufacturer);
    await registry.setRole(owner.address, RoleEnum.Owner);
    await registry.setRole(inspector.address, RoleEnum.Inspector);
    await registry.setRole(demolisher.address, RoleEnum.Demolisher);
    await registry.setRole(viewer.address, RoleEnum.Viewer);

    await registry.connect(manufacturer).registerBatch(
      "Staalfabriek", 0, "Staal S355", 1, 5000, "Heerlen", 1700000000, 0, sourceHash
    );
    await registry.connect(manufacturer).registerBatch(
      "Staalfabriek", 1, "Staal S355", 2, 1000, "Sittard", 1700005000, 0, sourceHash
    );
  });

  describe ("role management", () => {
      it("lets the admin assign a role", async () => {
          await registry.setRole(stranger.address, RoleEnum.Inspector);
          expect(await registry.roles(stranger.address)).to.equal(RoleEnum.Inspector)
      });

      it("refuses role changes from anyone but the admin", async () => {
          await expect(
              registry.connect(stranger).setRole(stranger.address, RoleEnum.Inspector)
          ).to.be.revertedWithCustomError(registry, "NotAdmin");
      });
  });

  describe("adding a claim", () => {
    it("stores the claim with the right data", async () => {
        await registry.connect(inspector).addClaim(BATCH_ID, ClaimTypeEnum.QualityDeclaration, hash);

        // claims[0] is the Registration claim that registerBatch wrote
        const claims = await registry.getClaims(BATCH_ID);
        expect(claims.length).to.equal(2);
        expect(claims[1].batchId).to.equal(BATCH_ID);
        expect(claims[1].submitter).to.equal(inspector.address);
        expect(claims[1].documentHash).to.equal(hash);
        expect(claims[1].claimType).to.equal(ClaimTypeEnum.QualityDeclaration);
    });
    
    it("takes the timestamp from the block, not from the caller", async () => {
      await registry.connect(inspector).addClaim(BATCH_ID, ClaimTypeEnum.QualityDeclaration, hash);

      const block = await ethers.provider.getBlock("latest");
      const claims = await registry.getClaims(BATCH_ID);
      expect(claims[1].timestamp).to.equal(block!.timestamp);
    });

    it("emits a ClaimAdded event", async () => {  
      await expect(
        registry.connect(inspector).addClaim(BATCH_ID, ClaimTypeEnum.QualityDeclaration, hash)
      )
        .to.emit(registry, "ClaimAdded")
        .withArgs(BATCH_ID, 1, inspector.address, hash, ClaimTypeEnum.QualityDeclaration);
    });

    it("refuses a batch that does not exist", async () => {
      await expect(
        registry.connect(inspector).addClaim(999, ClaimTypeEnum.QualityDeclaration, hash)
      ).to.be.revertedWithCustomError(registry, "BatchNotFound").withArgs(999);
    });

    it("refuses an empty hash", async () => {
      await expect(
        registry.connect(inspector).addClaim(BATCH_ID, ClaimTypeEnum.QualityDeclaration, ethers.ZeroHash)
      ).to.be.revertedWithCustomError(registry, "EmptyHash");
    });

    it("refuses an address that was never given a role", async () => {
      await expect(
        registry.connect(stranger).addClaim(BATCH_ID, ClaimTypeEnum.StatusChange, hash)
      ).to.be.revertedWithCustomError(registry, "NotAllowed");
    });
  });
 
  describe("rights per role", () => {
    // true = allowed, false = refused
    const rights = [
      { role: "Manufacturer", wallet: () => manufacturer, allowed: [] },
      { role: "Owner",        wallet: () => owner,        allowed: [ClaimTypeEnum.LocationChange, ClaimTypeEnum.StatusChange] },
      { role: "Inspector",    wallet: () => inspector,    allowed: [ClaimTypeEnum.QualityDeclaration] },
      { role: "Demolisher",   wallet: () => demolisher,   allowed: [ClaimTypeEnum.StatusChange] },
      { role: "Viewer",       wallet: () => viewer,       allowed: [] },
    ];
    const allTypes = [ClaimTypeEnum.StatusChange, ClaimTypeEnum.LocationChange, ClaimTypeEnum.QualityDeclaration];

    const claimTypeName = (value: number) =>
      Object.keys(ClaimTypeEnum).find(
        (key) => ClaimTypeEnum[key as keyof typeof ClaimTypeEnum] === value
      );
 
    for (const { role, wallet, allowed } of rights) {
      for (const claimType of allTypes) {
        const shouldWork = allowed.includes(claimType);

        it(`${role} ${shouldWork ? "can" : "cannot"} add a ${claimTypeName(claimType)}`, async () => {
          const signer = wallet();
          const call = registry.connect(signer).addClaim(BATCH_ID, claimType, hash);

          if (shouldWork) {
            await expect(call).to.emit(registry, "ClaimAdded");
          } else {
            await expect(call)
              .to.be.revertedWithCustomError(registry, "NotAllowed")
              .withArgs(signer.address, claimType);
          }
        });
      }
    }
  });
 
  describe("claims can only be added, never changed", () => {
    it("keeps earlier claims when a new one is added", async () => {
      const otherHash = ethers.keccak256(ethers.toUtf8Bytes("another document"));
 
      await registry.connect(inspector).addClaim(BATCH_ID, ClaimTypeEnum.QualityDeclaration, hash);
      await registry.connect(owner).addClaim(BATCH_ID, ClaimTypeEnum.LocationChange, otherHash);
 
      // claims[0] is the Registration claim that registerBatch wrote
      const claims = await registry.getClaims(BATCH_ID);
      expect(claims.length).to.equal(3);
      expect(claims[0].documentHash).to.equal(sourceHash);    // registration claim untouched
      expect(claims[1].documentHash).to.equal(hash);          // first added claim untouched
      expect(claims[2].documentHash).to.equal(otherHash);
      expect(await registry.getClaimCount(BATCH_ID)).to.equal(3);
    });
 
    it("keeps the claims of different batches separate", async () => { 
      await registry.connect(inspector).addClaim(1, ClaimTypeEnum.QualityDeclaration, hash);
 
      // every batch starts with its own Registration claim
      expect((await registry.getClaims(1)).length).to.equal(2);
      expect((await registry.getClaims(2)).length).to.equal(1);
    });
  });
})