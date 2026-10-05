import { expect } from "chai";
import { network} from "hardhat";
import { ClaimType} from "../enums/ClaimType.js";
import { Role } from "../enums/Role.js";

const { ethers } = await network.connect();

describe("ClaimRegistry", () => {
    const BATCH_ID = 1;
    const hash = ethers.keccak256(ethers.toUtf8Bytes("content of a test inspection report"));

    // Fresh contract + one wallet per role, before every test.
    async function deploy() {
        const [admin, manufacturer, owner, inspector, demolisher, viewer, stranger] = await ethers.getSigners();
        const registry = await ethers.deployContract("ClaimRegistry");

        await registry.setRole(manufacturer.address, Role.Manufacturer);
        await registry.setRole(owner.address, Role.Owner);
        await registry.setRole(inspector.address, Role.Inspector);
        await registry.setRole(demolisher.address, Role.Demolisher);
        await registry.setRole(viewer.address, Role.Viewer);

        return { registry, admin, manufacturer, owner, inspector, demolisher, viewer, stranger };
    }

    describe ("role management", () => {
        it("lets the admin assign a role", async () => {
            const { registry, stranger } = await deploy();
            await registry.setRole(stranger.address, Role.Inspector);
            expect(await registry.roles(stranger.address)).to.equal(Role.Inspector)
        });

        it("refuses role changes from anyone but the admin", async () => {
            const { registry, stranger } = await deploy ()
            await expect(
                registry.connect(stranger).setRole(stranger.address, Role.Inspector)
            ).to.be.revertedWithCustomError(registry, "NotAdmin");
        });
    });

    describe("adding a claim", () => {
        it("stores the claim with the right data", async () => {
            const { registry, inspector } = await deploy();

            await registry.connect(inspector).addClaim(BATCH_ID, ClaimType.QualityDecleration, hash);

            const claims = await registry.getClaims(BATCH_ID);
            expect(claims.lenght).to.equal(1);
            expect(claims[0].batchId).to.equal(BATCH_ID);
            expect(claims[0].submitter).to.equal(inspector.address);
            expect(claims[0].documentHash).to.equal(hash);
            expect(claims[0].claimType).to.equal(ClaimType.QualityDecleration);
        });
        it("takes the timestamp from the block, not from the caller", async () => {
      const { registry, inspector } = await deploy();
 
      await registry.connect(inspector).addClaim(BATCH_ID, ClaimType.QualityDeclaration, hash);
 
      const block = await ethers.provider.getBlock("latest");
      const claims = await registry.getClaims(BATCH_ID);
      expect(claims[0].timestamp).to.equal(block!.timestamp);
    });
 
    it("emits a ClaimAdded event", async () => {
      const { registry, inspector } = await deploy();
 
      await expect(
        registry.connect(inspector).addClaim(BATCH_ID, ClaimType.QualityDeclaration, hash)
      )
        .to.emit(registry, "ClaimAdded")
        .withArgs(BATCH_ID, 0, inspector.address, ClaimType.QualityDeclaration, hash);
    });
 
    it("refuses an empty hash", async () => {
      const { registry, inspector } = await deploy();
 
      await expect(
        registry.connect(inspector).addClaim(BATCH_ID, ClaimType.QualityDeclaration, ethers.ZeroHash)
      ).to.be.revertedWithCustomError(registry, "EmptyHash");
    });
 
    it("refuses an address that was never given a role", async () => {
      const { registry, stranger } = await deploy();
 
      await expect(
        registry.connect(stranger).addClaim(BATCH_ID, ClaimType.StatusChange, hash)
      ).to.be.revertedWithCustomError(registry, "NotAllowed");
    });
  });
 
  describe("rights per role (Rollen en rechten)", () => {
    // true = allowed, false = refused
    const rights: Record<string, { signer: string; allowed: ClaimType[] }> = {
      Manufacturer: { signer: "manufacturer", allowed: [] },
      Owner:        { signer: "owner",        allowed: [ClaimType.LocationChange, ClaimType.StatusChange] },
      Inspector:    { signer: "inspector",    allowed: [ClaimType.QualityDecleration] },
      Demolisher:   { signer: "demolisher",   allowed: [ClaimType.StatusChange] },
      Viewer:       { signer: "viewer",       allowed: [] },
    };
    const allTypes = [ClaimType.StatusChange, ClaimType.LocationChange, ClaimType.QualityDecleration];
 
    for (const [roleName, { signer, allowed }] of Object.entries(rights)) {
      for (const claimType of allTypes) {
        const shouldWork = allowed.includes(claimType);
 
        it(`${roleName} ${shouldWork ? "can" : "cannot"} add a ${ClaimType[claimType]}`, async () => {
          const ctx = await deploy();
          const wallet = (ctx as any)[signer];
          const call = ctx.registry.connect(wallet).addClaim(BATCH_ID, claimType, hash);
 
          if (shouldWork) {
            await expect(call).to.emit(ctx.registry, "ClaimAdded");
          } else {
            await expect(call)
              .to.be.revertedWithCustomError(ctx.registry, "NotAllowed")
              .withArgs(wallet.address, claimType);
          }
        });
      }
    }
  });
 
  describe("claims can only be added, never changed", () => {
    it("keeps earlier claims when a new one is added", async () => {
      const { registry, inspector, owner } = await deploy();
      const otherHash = ethers.keccak256(ethers.toUtf8Bytes("another document"));
 
      await registry.connect(inspector).addClaim(BATCH_ID, ClaimType.QualityDecleration, hash);
      await registry.connect(owner).addClaim(BATCH_ID, ClaimType.LocationChange, otherHash);
 
      const claims = await registry.getClaims(BATCH_ID);
      expect(claims.length).to.equal(2);
      expect(claims[0].documentHash).to.equal(hash);          // first claim untouched
      expect(claims[1].documentHash).to.equal(otherHash);
      expect(await registry.getClaimCount(BATCH_ID)).to.equal(2);
    });
 
    it("keeps the claims of different batches separate", async () => {
      const { registry, inspector } = await deploy();
 
      await registry.connect(inspector).addClaim(1, ClaimType.QualityDecleration, hash);
 
      expect((await registry.getClaims(1)).length).to.equal(1);
      expect((await registry.getClaims(2)).length).to.equal(0);
    });
  });
 
  describe("TypeScript and Solidity enums stay in sync", () => {
    it("ClaimType numbers match the contract", () => {
      expect(ClaimType.StatusChange).to.equal(0);
      expect(ClaimType.LocationChange).to.equal(1);
      expect(ClaimType.QualityDecleration).to.equal(2);
    });
 
    it("Role numbers match the contract", () => {
      expect(Role.Manufacturer).to.equal(0);
      expect(Role.Owner).to.equal(1);
      expect(Role.Inspector).to.equal(2);
      expect(Role.Demolisher).to.equal(3);
      expect(Role.Viewer).to.equal(4);
    });
  });
})