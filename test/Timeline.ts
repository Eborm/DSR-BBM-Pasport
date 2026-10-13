import { expect } from "chai";
import { network } from "hardhat";

const { ethers } = await network.create();

const RoleEnum = { Viewer: 0, Manufacturer: 1, Inspector: 2, Owner: 3, Demolisher: 4 };
const ClaimTypeEnum = { StatusChange: 0, LocationChange: 1, QualityDeclaration: 2, Registration: 3, OwnershipTransfer: 4 };

const hashOf = (text: string) => ethers.keccak256(ethers.toUtf8Bytes(text));

// This test suite tests Requirement 7 (lifecycle): the timeline of a batch is its list of claims. Registration and
// ownership transfer are written as claims by the contract, so one list holds the whole life of a batch.
describe("Timeline", function () {
  let registry: any;
  let manufacturer: any;
  let inspector: any;
  let buyer: any;
  let demolisher: any;
  let stranger: any;

  beforeEach(async function () {
    registry = await ethers.deployContract("MaterialPassport");
    [, manufacturer, inspector, buyer, demolisher, stranger] = await ethers.getSigners();
    await registry.setRole(manufacturer.address, RoleEnum.Manufacturer);
    await registry.setRole(inspector.address, RoleEnum.Inspector);
    await registry.setRole(buyer.address, RoleEnum.Owner);
    await registry.setRole(demolisher.address, RoleEnum.Demolisher);
  });

  async function register(producer: string) {
    await (
      await registry
        .connect(manufacturer)
        .registerBatch(producer, 0, "Staal S355", 1, 5000, "Heerlen", 1700000000, 0, hashOf(`source of ${producer}`))
    ).wait();
    return await registry.batchCount();
  }

  // production -> inspection -> sale -> placement -> sale to demolisher -> demolition
  async function runLifecycle(id: bigint) {
    await registry.connect(inspector).addClaim(id, ClaimTypeEnum.QualityDeclaration, hashOf("inspection"));
    await registry.connect(manufacturer).transferOwnership(id, buyer.address, hashOf("sale"));
    await registry.connect(buyer).addClaim(id, ClaimTypeEnum.LocationChange, hashOf("placement"));
    await registry.connect(buyer).transferOwnership(id, demolisher.address, hashOf("sale to demolisher"));
    await registry.connect(demolisher).addClaim(id, ClaimTypeEnum.StatusChange, hashOf("demolition"));
  }

  it("starts with the registration of the batch", async function () {
    const id = await register("Staalfabriek");
    const timeline = await registry.getClaims(id);

    expect(timeline.length).to.equal(1);
    expect(timeline[0].claimType).to.equal(ClaimTypeEnum.Registration);
    expect(timeline[0].submitter).to.equal(manufacturer.address);
  });

  it("holds every step of the life of a batch, in the order it happened", async function () {
    const id = await register("Staalfabriek");
    await runLifecycle(id);

    const timeline = await registry.getClaims(id);
    expect(timeline.map((entry: any) => Number(entry.claimType))).to.deep.equal([
      ClaimTypeEnum.Registration,
      ClaimTypeEnum.QualityDeclaration,
      ClaimTypeEnum.OwnershipTransfer,
      ClaimTypeEnum.LocationChange,
      ClaimTypeEnum.OwnershipTransfer,
      ClaimTypeEnum.StatusChange,
    ]);
    expect(timeline.map((entry: any) => entry.submitter)).to.deep.equal([
      manufacturer.address,
      inspector.address,
      manufacturer.address,
      buyer.address,
      buyer.address,
      demolisher.address,
    ]);
    expect(await registry.getClaimCount(id)).to.equal(6);
  });

  it("never lets time run backwards", async function () {
    const id = await register("Staalfabriek");
    await runLifecycle(id);

    const timeline = await registry.getClaims(id);
    for (let i = 1; i < timeline.length; i++) {
      expect(timeline[i].timestamp).to.be.greaterThanOrEqual(timeline[i - 1].timestamp);
    }
  });

  it("keeps the timelines of different batches apart", async function () {
    const first = await register("Staalfabriek");
    const second = await register("Betonfabriek");
    await runLifecycle(first);

    expect((await registry.getClaims(first)).length).to.equal(6);
    expect((await registry.getClaims(second)).length).to.equal(1);
  });

  it("can be read by anyone, also without a role", async function () {
    const id = await register("Staalfabriek");
    await runLifecycle(id);

    const timeline = await registry.connect(stranger).getClaims(id);
    expect(timeline.length).to.equal(6);
  });

  it("shows who received the batch, through the event of the same transaction as the transfer claim", async function () {
    // The app reads the recipient of a transfer this way (loadTransferRecipients in chain.ts).
    const id = await register("Staalfabriek");
    await runLifecycle(id);

    const claimLogs = await registry.queryFilter(registry.filters.ClaimAdded(id));
    const transferLogs = await registry.queryFilter(registry.filters.OwnershipTransferred(id));

    const transferClaims = claimLogs.filter((log: any) => Number(log.args.claimType) === ClaimTypeEnum.OwnershipTransfer);
    expect(transferClaims.length).to.equal(2);
    expect(transferLogs.length).to.equal(2);

    // Same transaction, same position: the n-th transfer claim belongs to the n-th transfer event.
    expect(transferClaims[0].transactionHash).to.equal(transferLogs[0].transactionHash);
    expect(transferClaims[1].transactionHash).to.equal(transferLogs[1].transactionHash);
    expect(transferLogs[0].args.to).to.equal(buyer.address);
    expect(transferLogs[1].args.to).to.equal(demolisher.address);
  });

  it("ends with the recipient of the last transfer as the current owner", async function () {
    const id = await register("Staalfabriek");
    await runLifecycle(id);

    const transferLogs = await registry.queryFilter(registry.filters.OwnershipTransferred(id));
    const lastRecipient = transferLogs[transferLogs.length - 1].args.to;

    expect((await registry.batches(id)).currentOwner).to.equal(lastRecipient);
  });
});
