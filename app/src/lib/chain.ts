import { Contract, EventLog, JsonRpcProvider } from "ethers";
import { Role, type Batch, type Claim } from "./domain";

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
  /** Claims per batch ID, oldest first. */
  claims: Map<bigint, Claim[]>;
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

  const claims = new Map<bigint, Claim[]>();
  await Promise.all(
    [...batches.keys()].map(async (id) => {
      const raw: any[] = await contract.getClaims(id);
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

  return { batches, roles, claims };
}

/** Role of an arbitrary address, even if it's not in the snapshot yet. */
export async function roleOf(contract: Contract, address: string): Promise<Role> {
  const r: bigint = await contract.roles(address);
  return Number(r) as Role;
}

export async function loadTransferRecipients(contract: Contract, batchId: bigint): Promise<Map<number, string>> {
  const transferLogs = await contract.queryFilter(contract.filters.OwnershipTransferred(batchId));
  const claimLogs = await contract.queryFilter(contract.filters.ClaimAdded(batchId));
  
  const recipientByTransaction = new Map<string, string>();
  for (const log of transferLogs) {
    recipientByTransaction.set(log.transactionHash, (log as EventLog).args.to);
  }

  const recipients = new Map<number, string>();
  for (const log of claimLogs) {
    const to = recipientByTransaction.get(log.transactionHash);
    if (to !== undefined) {
      recipients.set(Number((log as EventLog).args.claimIndex), to);
    }
  }

  return recipients;
}