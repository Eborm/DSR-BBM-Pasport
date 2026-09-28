import { expect } from "chai";
import { keccak256, toUtf8Bytes } from "ethers";
import { network } from "hardhat";
import { batchInput, deployPassport } from "./helpers/passport.js";
import { suiteTitle } from "./helpers/requirements.js";

const { ethers, networkHelpers } = await network.create();

async function deployFixture() {
  return deployPassport(ethers);
}

const ERC1155_INTERFACE_ID = "0xd9b67a26";
const ERC1155_METADATA_URI_INTERFACE_ID = "0x0e89341c";

describe(suiteTitle("R4"), function () {
  it("implementeert de open tokenstandaard ERC-1155, inclusief metadata-URI", async function () {
    const { passport } = await networkHelpers.loadFixture(deployFixture);

    expect(await passport.supportsInterface(ERC1155_INTERFACE_ID)).to.equal(true);
    expect(await passport.supportsInterface(ERC1155_METADATA_URI_INTERFACE_ID)).to.equal(true);
  });

  it("verwijst via de standaardfunctie uri() naar het paspoortdocument van de batch", async function () {
    const { passport, fabrikant } = await networkHelpers.loadFixture(deployFixture);
    const metadataURI = "file://paspoorten/1.jsonld";

    await passport
      .connect(fabrikant)
      .registerBatch(batchInput({ metadataURI, metadataHash: keccak256(toUtf8Bytes("paspoort")) }));

    expect(await passport.uri(1n)).to.equal(metadataURI);
  });

  // Volgt met de JSON-LD export (bouwvolgorde stap 6).
  it("de JSON-LD export valideert tegen het schema");
});
