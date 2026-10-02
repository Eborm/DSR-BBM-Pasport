/**
 * Deploys MaterialPassport (Sven's contract), assigns roles to five test
 * accounts (admin + one account per role), and registers a couple of sample
 * batches. Writes address + ABI to app/public/deployment.json, so the web app
 * knows which contract to talk to.
 *
 *   hardhat run scripts/demo-data.ts --network localhost
 *
 * Expects a running local chain (hardhat node).
 */
import { network } from "hardhat";
import { writeFile, mkdir } from "node:fs/promises";

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
  await (await registry.assignRole(manufacturer.address, 1)).wait(); // Manufacturer
  await (await registry.assignRole(inspector.address, 2)).wait(); // Inspector
  await (await registry.assignRole(owner.address, 3)).wait(); // Owner
  await (await registry.assignRole(demolisher.address, 4)).wait(); // Demolisher

  console.log("Registering sample batches...");
  const now = Math.floor(Date.now() / 1000);
  await (
    await registry
      .connect(manufacturer)
      .registerBatch("Staalfabriek Zuid-Limburg", 2 /* B */, "Staal S355, HEA 200", 3 /* BuildingElement */, 5000n, "Heerlen", now - 86400, 0 /* Bim */)
  ).wait();
  await (
    await registry
      .connect(manufacturer)
      .registerBatch("Betonfabriek De Maas", 1 /* A2 */, "Kanaalplaatvloer beton C45/55", 2 /* Component */, 12000n, "Sittard", now - 172800, 0 /* Bim */)
  ).wait();

  const accounts = [
    { address: admin.address, name: "Beheerder", role: "Admin" },
    { address: manufacturer.address, name: "Staalfabriek Zuid-Limburg", role: ROLE_NAMES[1] },
    { address: inspector.address, name: "Keuringsinstituut Limburg", role: ROLE_NAMES[2] },
    { address: owner.address, name: "Bouwbedrijf Heerlen", role: ROLE_NAMES[3] },
    { address: demolisher.address, name: "Sloopbedrijf Parkstad", role: ROLE_NAMES[4] },
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
