/**
 * Reading from and writing to the chain, matching Sven's MaterialPassport.sol
 * and ClaimRegistry.sol. This replaces the original, which used generated
 * TypeChain types for the team contract. Here we use plain ethers.Contract
 * objects with the ABIs from deployment.json, so no separate type-generation
 * step is needed.
 */
import { Contract, JsonRpcProvider } from "ethers";
import { ClaimRole, Role, type Batch, type Claim } from "./domain";

export interface DemoAccount {
  name: string;
  address: string;
  role: string;
}

export interface ContractInfo {
  address: string;
  abi: any[];
}

/** Written by scripts/demo-data.ts on `npm run demo`. */
export interface Deployment extends ContractInfo {
  accounts: DemoAccount[];
  /**
   * Optional, so an older deployment.json (from before ClaimRegistry was part
   * of the demo) still loads. Without it, the claim screens say the demo has
   * to be restarted.
   */
  claimRegistry?: ContractInfo;
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
  const claims = deployment.claimRegistry
    ? new Contract(deployment.claimRegistry.address, deployment.claimRegistry.abi, provider)
    : null;
  return { provider, contract, claims };
}

export async function writableContract(provider: JsonRpcProvider, address: string, deployment: Deployment) {
  // The local demo chain manages the test accounts' keys itself; in
  // production the user's own wallet would sign instead.
  const signer = await provider.getSigner(address);
  return new Contract(deployment.address, deployment.abi, signer);
}

export async function writableClaims(provider: JsonRpcProvider, address: string, deployment: Deployment) {
  if (!deployment.claimRegistry) throw new Error("ClaimRegistry is not deployed.");
  const signer = await provider.getSigner(address);
  return new Contract(deployment.claimRegistry.address, deployment.claimRegistry.abi, signer);
}

export interface Snapshot {
  batches: Map<bigint, Batch>;
  /** Role per address (lowercase). `undefined` if the address is unknown. */
  roles: Map<string, Role>;
  /** Claims per batch ID, oldest first. Empty if ClaimRegistry is not deployed. */
  claims: Map<bigint, Claim[]>;
  /** Role per address (lowercase) according to ClaimRegistry, which keeps its own roles. */
  claimRoles: Map<string, ClaimRole>;
}

export async function loadSnapshot(contract: Contract, claimRegistry: Contract | null, deployment: Deployment): Promise<Snapshot> {
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

  const claims = new Map<bigint, Claim[]>();
  const claimRoles = new Map<string, ClaimRole>();
  if (claimRegistry) {
    await Promise.all(
      [...batches.keys()].map(async (id) => {
        const raw: any[] = await claimRegistry.getClaims(id);
        claims.set(
          id,
          raw.map((c, index) => ({
            batchId: c.batchId,
            submitter: c.submitter,
            documentHash: c.documentHash,
            timestamp: c.timestamp,
            claimType: Number(c.claimType),
            index,
          })),
        );
      }),
    );
    for (const account of deployment.accounts) {
      const r: bigint = await claimRegistry.roles(account.address);
      claimRoles.set(account.address.toLowerCase(), Number(r) as ClaimRole);
    }
  }

  return { batches, roles, claims, claimRoles };
}

/** Role of an arbitrary address, even if it's not in the snapshot yet. */
export async function roleOf(contract: Contract, address: string): Promise<Role> {
  const r: bigint = await contract.roles(address);
  return Number(r) as Role;
}
