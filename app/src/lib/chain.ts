/**
 * Reading from and writing to the chain, matching Sven's MaterialPassport.sol.
 * This replaces the original, which used generated TypeChain types for the
 * team contract. Here we use a plain ethers.Contract with the ABI from
 * deployment.json, so no separate type-generation step is needed.
 */
import { Contract, JsonRpcProvider } from "ethers";
import { Role, type Batch } from "./domain";

export interface DemoAccount {
  name: string;
  address: string;
  role: string;
}

/** Written by scripts/demo-data.ts on `npm run demo`. */
export interface Deployment {
  address: string;
  abi: any[];
  accounts: DemoAccount[];
}

export async function loadDeployment(): Promise<Deployment | undefined> {
  const response = await fetch("/deployment.json", { cache: "no-store" });
  if (!response.ok) return undefined;
  return (await response.json()) as Deployment;
}

const RPC_URL = "http://127.0.0.1:8545";

export function connect(deployment: Deployment) {
  const provider = new JsonRpcProvider(RPC_URL);
  const contract = new Contract(deployment.address, deployment.abi, provider);
  return { provider, contract };
}

export async function writableContract(provider: JsonRpcProvider, address: string, deployment: Deployment) {
  // The local demo chain manages the test accounts' keys itself; in
  // production the user's own wallet would sign instead.
  const signer = await provider.getSigner(address);
  return new Contract(deployment.address, deployment.abi, signer);
}

export interface Snapshot {
  batches: Map<bigint, Batch>;
  /** Role per address (lowercase). `undefined` if the address is unknown. */
  roles: Map<string, Role>;
}

export async function loadSnapshot(contract: Contract, deployment: Deployment): Promise<Snapshot> {
  const count: bigint = await contract.batchCount();
  const batches = new Map<bigint, Batch>();
  for (let id = 1n; id <= count; id++) {
    const raw = await contract.batches(id);
    batches.set(id, {
      id: raw.id,
      producer: raw.producer,
      classification: Number(raw.classification),
      materialType: raw.materialType,
      level: Number(raw.level),
      mass: raw.mass,
      origin: raw.origin,
      productionDate: raw.productionDate,
      currentOwner: raw.currentOwner,
      registeredAt: raw.registeredAt,
      sourceFile: Number(raw.sourceFile),
    });
  }

  const roles = new Map<string, Role>();
  for (const account of deployment.accounts) {
    const r: bigint = await contract.roles(account.address);
    roles.set(account.address.toLowerCase(), Number(r) as Role);
  }

  return { batches, roles };
}

/** Role of an arbitrary address, even if it's not in the snapshot yet. */
export async function roleOf(contract: Contract, address: string): Promise<Role> {
  const r: bigint = await contract.roles(address);
  return Number(r) as Role;
}
