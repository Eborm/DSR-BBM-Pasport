import { expect } from "chai";
import { FunctionFragment, keccak256, toUtf8Bytes } from "ethers";
import { network } from "hardhat";
import { batchInput, deployPassport, kind, timeline } from "./helpers/passport.js";
import { suiteTitle } from "./helpers/requirements.js";

const { ethers, networkHelpers } = await network.create();

async function registeredBatchFixture() {
  const actors = await deployPassport(ethers);
  await actors.passport.connect(actors.fabrikant).registerBatch(batchInput());
  return actors;
}

const keuringsrapport = toUtf8Bytes("Keuringsrapport batch 1: restcapaciteit 85%, geschikt voor hergebruik.");

describe(suiteTitle("R5"), function () {
  it("legt bij elke claim vast wie hem indiende, wanneer, en de hash van het document", async function () {
    const { passport, keurder } = await networkHelpers.loadFixture(registeredBatchFixture);
    const documentHash = keccak256(keuringsrapport);

    const tx = await passport
      .connect(keurder)
      .addClaim(1n, kind("inspection"), documentHash, "file://documenten/keuring.pdf", "Restcapaciteit 85%");
    const receipt = await tx.wait();
    const block = await ethers.provider.getBlock(receipt!.blockNumber);

    const [, claim] = await timeline(passport, 1n);
    expect(claim.actor).to.equal(keurder.address);
    expect(claim.timestamp).to.equal(BigInt(block!.timestamp));
    expect(claim.documentHash).to.equal(documentHash);
    expect(claim.documentURI).to.equal("file://documenten/keuring.pdf");
  });

  it("laat de hashcontrole falen zodra één byte van het document is gewijzigd", async function () {
    const { passport, keurder } = await networkHelpers.loadFixture(registeredBatchFixture);
    await passport
      .connect(keurder)
      .addClaim(1n, kind("inspection"), keccak256(keuringsrapport), "file://documenten/keuring.pdf", "");
    const [, claim] = await timeline(passport, 1n);

    const vervalst = Uint8Array.from(keuringsrapport);
    vervalst[vervalst.indexOf("8".charCodeAt(0))] = "9".charCodeAt(0); // 85% wordt 95%

    expect(keccak256(keuringsrapport)).to.equal(claim.documentHash);
    expect(keccak256(vervalst)).to.not.equal(claim.documentHash);
  });

  it("weigert een claim zonder documenthash of zonder documentverwijzing", async function () {
    const { passport, keurder } = await networkHelpers.loadFixture(registeredBatchFixture);

    await expect(
      passport.connect(keurder).addClaim(1n, kind("inspection"), ethers.ZeroHash, "file://documenten/keuring.pdf", ""),
    ).to.be.revertedWithCustomError(passport, "EmptyHash");
    await expect(
      passport.connect(keurder).addClaim(1n, kind("inspection"), keccak256(keuringsrapport), "", ""),
    ).to.be.revertedWithCustomError(passport, "EmptyDocumentURI");
  });

  it("bewaart tegenstrijdige keuringen naast elkaar, elk met eigen afzender", async function () {
    const { passport, keurder, tweedeKeurder } = await networkHelpers.loadFixture(registeredBatchFixture);

    await passport
      .connect(keurder)
      .addClaim(1n, kind("inspection"), keccak256(toUtf8Bytes("85%")), "file://documenten/a.pdf", "Restcapaciteit 85%");
    await passport
      .connect(tweedeKeurder)
      .addClaim(1n, kind("inspection"), keccak256(toUtf8Bytes("60%")), "file://documenten/b.pdf", "Restcapaciteit 60%");

    const inspections = (await timeline(passport, 1n)).filter((line) => line.kind === kind("inspection"));
    expect(inspections.map((line) => [line.actor, line.description])).to.deep.equal([
      [keurder.address, "Restcapaciteit 85%"],
      [tweedeKeurder.address, "Restcapaciteit 60%"],
    ]);
  });

  it("staat niet toe dat iemand via een claim een registratie, overdracht of splitsing veinst", async function () {
    const { passport, keurder } = await networkHelpers.loadFixture(registeredBatchFixture);

    for (const name of ["registration", "transfer", "split"]) {
      await expect(
        passport.connect(keurder).addClaim(1n, kind(name), keccak256(keuringsrapport), "file://x", ""),
      ).to.be.revertedWithCustomError(passport, "KindNotClaimable");
    }
  });

  it("heeft geen enkele functie waarmee historie kan worden gewijzigd of verwijderd", async function () {
    const { passport } = await networkHelpers.loadFixture(registeredBatchFixture);

    const writeFunctions = passport.interface.fragments
      .filter(FunctionFragment.isFragment)
      .filter((fragment) => !fragment.constant)
      .map((fragment) => fragment.name)
      .sort();

    expect(writeFunctions).to.deep.equal([
      "addClaim",
      "grantRole",
      "registerBatch",
      "renounceRole",
      "revokeRole",
      "setApprovalForAll",
      "splitBatch",
      "transferOwnership",
    ]);
  });
});
