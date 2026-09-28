import { expect } from "chai";
import { keccak256, toUtf8Bytes } from "ethers";
import { network } from "hardhat";
import { batchInput, deployPassport, kind, timeline } from "./helpers/passport.js";
import { suiteTitle } from "./helpers/requirements.js";

const { ethers, networkHelpers } = await network.create();

async function deployFixture() {
  return deployPassport(ethers);
}

const doc = (text: string) => keccak256(toUtf8Bytes(text));
const JAAR_2044 = 2335219200; // 1 januari 2044

describe(suiteTitle("R7"), function () {
  it("doorloopt registratie, plaatsing, demontage, keuring, splitsing en hergebruik; alle regels blijven zichtbaar", async function () {
    const { passport, fabrikant, aannemer, sloper, keurder, architect } =
      await networkHelpers.loadFixture(deployFixture);

    // Casus: stalen liggers uit een donorgebouw in Heerlen (SPEC §10).
    await passport.connect(fabrikant).registerBatch(
      batchInput({ metadataURI: "file://paspoorten/1.jsonld", metadataHash: doc("paspoort") }),
    );
    await passport.connect(fabrikant).transferOwnership(1n, aannemer.address, 200n);
    await passport
      .connect(aannemer)
      .addClaim(1n, kind("placement"), doc("bouwtekening"), "file://bouwtekening.pdf", "Geplaatst in kantoorgebouw Heerlen");

    await networkHelpers.time.increaseTo(JAAR_2044);
    await passport
      .connect(sloper)
      .addClaim(1n, kind("demolition"), doc("conditierapport"), "file://conditie.pdf", "Gedemonteerd, goede staat");
    await passport
      .connect(keurder)
      .addClaim(1n, kind("inspection"), doc("herkeuring"), "file://herkeuring.pdf", "Restcapaciteit 85%");
    await passport.connect(aannemer).splitBatch(1n, 50n, architect.address);
    await passport
      .connect(architect)
      .addClaim(2n, kind("reuse"), doc("hergebruik"), "file://hergebruik.pdf", "Toegepast in nieuw project");

    const origineel = await timeline(passport, 1n);
    expect(origineel.map((line) => line.kind)).to.deep.equal(
      ["registration", "transfer", "placement", "demolition", "inspection", "split"].map(kind),
    );

    const tak = await timeline(passport, 2n);
    expect(tak.map((line) => line.kind)).to.deep.equal(["split", "reuse"].map(kind));

    const timestamps = [...origineel, ...tak].map((line) => line.timestamp);
    expect(timestamps).to.deep.equal([...timestamps].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)));
    expect(origineel[3].timestamp >= BigInt(JAAR_2044)).to.equal(true);
  });

  it("laat de historie van vóór de splitsing geldig voor beide takken", async function () {
    const { passport, fabrikant, aannemer, architect } = await networkHelpers.loadFixture(deployFixture);
    await passport.connect(fabrikant).registerBatch(batchInput());
    await passport.connect(fabrikant).transferOwnership(1n, aannemer.address, 200n);
    await passport.connect(aannemer).splitBatch(1n, 50n, architect.address);

    const tak = await passport.getBatch(2n);
    const herkomst = await timeline(passport, tak.parentId);

    expect(herkomst[0].kind).to.equal(kind("registration"));
    expect(herkomst[0].actor).to.equal(fabrikant.address);
    expect((await passport.getBatch(1n)).quantity).to.equal(150n);
    expect(tak.quantity).to.equal(50n);
    expect(await passport.balanceOf(aannemer.address, 1n)).to.equal(150n);
    expect(await passport.balanceOf(architect.address, 2n)).to.equal(50n);
  });

  it("voegt een correctie toe als nieuwe regel, zonder de oude te overschrijven", async function () {
    const { passport, fabrikant, keurder } = await networkHelpers.loadFixture(deployFixture);
    await passport.connect(fabrikant).registerBatch(batchInput());

    await passport.connect(keurder).addClaim(1n, kind("inspection"), doc("v1"), "file://v1.pdf", "Restcapaciteit 80%");
    await passport
      .connect(keurder)
      .addClaim(1n, kind("inspection"), doc("v2"), "file://v2.pdf", "Correctie: restcapaciteit 85%");

    const descriptions = (await timeline(passport, 1n)).map((line) => line.description);
    expect(descriptions).to.deep.equal(["", "Restcapaciteit 80%", "Correctie: restcapaciteit 85%"]);
  });
});
