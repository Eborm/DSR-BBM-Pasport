/**
 * Deploys MaterialPassport, assigns roles to five test accounts (admin + one
 * account per role), registers a couple of sample batches and adds a few
 * sample claims. Writes address + ABI of the contract to
 * app/public/deployment.json, so the web app knows which contract to talk to.
 *
 *   hardhat run scripts/demo-data.ts --network localhost
 *
 * Expects a running local chain (hardhat node).
 */
import { network } from "hardhat";
import { writeFile, mkdir, readFile } from "node:fs/promises";
import { DECLARATION_SCHEMA, declarationBytes, hashBytes, type CircularityDeclaration } from "../app/src/lib/circularity";

const { ethers } = await network.connect({ network: "localhost" });

const ROLE_NAMES = ["Viewer", "Manufacturer", "Inspector", "Owner", "Demolisher"] as const;

async function main() {
  const [admin, manufacturer, inspector, owner, demolisher] = await ethers.getSigners();

  console.log("Deploying contract...");
  const registry = await ethers.deployContract("MaterialPassport");
  await registry.waitForDeployment();
  const address = await registry.getAddress();
  console.log(`MaterialPassport is at ${address}`);

  console.log("Assigning roles...");
  await (await registry.setRole(manufacturer.address, 1)).wait(); // Manufacturer
  await (await registry.setRole(inspector.address, 2)).wait(); // Inspector
  await (await registry.setRole(owner.address, 3)).wait(); // Owner
  await (await registry.setRole(demolisher.address, 4)).wait(); // Demolisher

  console.log("Registering sample batches...");
  const hashOf = (text: string) => ethers.keccak256(ethers.toUtf8Bytes(text));
  const now = Math.floor(Date.now() / 1000);
  await (
    await registry
      .connect(manufacturer)
      .registerBatch("South Limburg Steelworks", 2 /* B */, "Steel S355, HEA 200", 3 /* BuildingElement */, 5000n, "Heerlen", now - 86400, 0 /* Bim */, hashOf("BIM model batch 1"))
  ).wait();
  await (
    await registry
      .connect(manufacturer)
      .registerBatch("De Maas Concrete Factory", 1 /* A2 */, "Hollow-core slab concrete C45/55", 2 /* Component */, 12000n, "Sittard", now - 172800, 0 /* Bim */, hashOf("BIM model batch 2"))
  ).wait();

  console.log("Adding sample claims...");
  // The inspection report is a real file, so the Verify screen can be tried with it:
  // download http://localhost:5173/demo/inspection-report-batch-1.txt and choose it there.
  const report = await readFile("app/public/demo/inspection-report-batch-1.txt");
  await (await registry.connect(inspector).addClaim(1, 2 /* QualityDeclaration */, ethers.keccak256(report))).wait();
  await (await registry.connect(owner).addClaim(1, 1 /* LocationChange */, hashOf("Transport document to construction site Heerlen"))).wait();
  await (await registry.connect(inspector).addClaim(2, 2 /* QualityDeclaration */, hashOf("Inspection report hollow-core slab C45/55"))).wait();
  
  await (await registry.connect(manufacturer).transferOwnership(1, owner.address, hashOf("buy agreement for batch 1"))).wait();

  console.log("Adding circularity declarations...");
  // The declarations go to the off-chain document store (the same folder server/api.ts serves from);
  // only their hashes go on the chain. The values are made up for the demo.
  const declarations: CircularityDeclaration[] = [
    {
      schema: DECLARATION_SCHEMA,
      batchId: "1",
      reusablePercent: 90,
      recyclablePercent: 98,
      repairability: "good",
      recycledContentPercent: 85,
      residualValueEur: 2500,
      nextApplications: ["Reuse as a structural beam in a new building", "Reuse as a support frame"],
      environment: { gwpA1A3KgCo2ePerKg: 0.85 },
    },
    {
      schema: DECLARATION_SCHEMA,
      batchId: "2",
      reusablePercent: 70,
      recyclablePercent: 95,
      repairability: "limited",
      recycledContentPercent: 5,
      residualValueEur: 3000,
      nextApplications: ["Reuse as a floor slab", "Crushed aggregate for road foundations"],
      environment: { gwpA1A3KgCo2ePerKg: 0.16 },
    },
  ];
  await mkdir(".demo/documents", { recursive: true });
  for (const declaration of declarations) {
    const bytes = declarationBytes(declaration);
    const hash = hashBytes(bytes);
    await writeFile(`.demo/documents/${hash}`, bytes);
    await (await registry.connect(manufacturer).addClaim(BigInt(declaration.batchId), 5 /* CircularityInfo */, hash)).wait();
  }

  const accounts = [
    { address: admin.address, name: "Administrator", role: "Admin" },
    { address: manufacturer.address, name: "South Limburg Steelworks", role: ROLE_NAMES[1] },
    { address: inspector.address, name: "Limburg Inspection Institute", role: ROLE_NAMES[2] },
    { address: owner.address, name: "Heerlen Construction Company", role: ROLE_NAMES[3] },
    { address: demolisher.address, name: "Parkstad Demolition Company", role: ROLE_NAMES[4] },
  ];

  const artifact = await import("../artifacts/contracts/MaterialPassport.sol/MaterialPassport.json", {
    with: { type: "json" },
  });

  const deployment = {
    address,
    abi: artifact.default.abi,
    accounts,
  };

  await mkdir("app/public", { recursive: true });
  await writeFile("app/public/deployment.json", JSON.stringify(deployment, null, 2));
  console.log("Deployment data written to app/public/deployment.json");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
