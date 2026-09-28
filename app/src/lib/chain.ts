/**
 * Lezen van de keten. Alles hier is voor iedereen toegankelijk (SPEC §4):
 * batchgegevens via `getBatch`, de historie via de events.
 */
import { JsonRpcProvider, ZeroAddress } from "ethers";
import { MaterialPassport__factory } from "../../../types/ethers-contracts/factories/MaterialPassport__factory.js";
import type { MaterialPassport } from "../../../types/ethers-contracts/MaterialPassport.js";
import { kindFromId, ROLE_ID, ROLES, type Batch, type Line, type Role } from "./domain";

export type { MaterialPassport };

export interface DemoAccount {
  name: string;
  address: string;
  toelichting: string;
}

/** Geschreven door scripts/demo-data.ts bij `npm run demo`. */
export interface Deployment {
  chainId: number;
  rpcUrl: string;
  storageUrl: string;
  address: string;
  deployBlock: number;
  accounts: DemoAccount[];
}

export async function loadDeployment(): Promise<Deployment | undefined> {
  const response = await fetch("/deployment.json", { cache: "no-store" });
  if (!response.ok) return undefined;
  return (await response.json()) as Deployment;
}

export function connect(deployment: Deployment) {
  const provider = new JsonRpcProvider(deployment.rpcUrl, deployment.chainId, { staticNetwork: true });
  const contract = MaterialPassport__factory.connect(deployment.address, provider);
  return { provider, contract };
}

export async function writableContract(provider: JsonRpcProvider, address: string, deployment: Deployment) {
  // De lokale demoketen beheert de sleutels van de testaccounts zelf; in
  // productie tekent de wallet van de gebruiker.
  const signer = await provider.getSigner(address);
  return MaterialPassport__factory.connect(deployment.address, signer);
}

export interface Snapshot {
  batches: Map<bigint, Batch>;
  /** Eigen tijdlijnregels per batch, in volgorde van uitzending. */
  lines: Map<bigint, Line[]>;
  /** Rollen per adres (kleine letters). */
  roles: Map<string, Role[]>;
}

export async function loadSnapshot(contract: MaterialPassport, deployment: Deployment): Promise<Snapshot> {
  const count = Number(await contract.batchCount());
  const [structs, timeline, transfers, splits] = await Promise.all([
    Promise.all(Array.from({ length: count }, (_, i) => contract.getBatch(BigInt(i + 1)))),
    contract.queryFilter(contract.filters.TimelineEvent(), deployment.deployBlock),
    contract.queryFilter(contract.filters.TransferSingle(), deployment.deployBlock),
    contract.queryFilter(contract.filters.BatchSplit(), deployment.deployBlock),
  ]);

  const batches = new Map<bigint, Batch>(
    structs.map((b) => [
      b.id,
      {
        id: b.id,
        materialType: b.materialType,
        quantity: b.quantity,
        unit: b.unit,
        level: Number(b.level),
        origin: b.origin,
        productionDate: b.productionDate,
        registrant: b.registrant,
        owner: b.owner,
        metadataURI: b.metadataURI,
        parentId: b.parentId,
      },
    ]),
  );

  // Ontvanger van een overdracht: de ERC-1155-transfer in dezelfde transactie
  // (mint en burn tellen niet mee).
  const recipients = new Map<string, string>();
  for (const event of transfers) {
    const { from, to, id } = event.args;
    if (from !== ZeroAddress && to !== ZeroAddress) recipients.set(`${event.transactionHash}:${id}`, to);
  }
  const splitsByTx = new Map(
    splits.map((event) => [
      event.transactionHash,
      { parentId: event.args.parentId, childId: event.args.childId, amount: event.args.amount },
    ]),
  );

  const lines = new Map<bigint, Line[]>();
  for (const event of timeline) {
    const { batchId, kind, actor, timestamp, documentURI, documentHash, description } = event.args;
    const line: Line = {
      key: `${event.transactionHash}-${event.index}`,
      batchId,
      kind: kindFromId(kind),
      actor,
      timestamp: Number(timestamp),
      documentURI,
      documentHash,
      description,
      blockNumber: event.blockNumber,
      logIndex: event.index,
      txHash: event.transactionHash,
      transferTo: recipients.get(`${event.transactionHash}:${batchId}`),
      split: splitsByTx.get(event.transactionHash),
    };
    lines.set(batchId, [...(lines.get(batchId) ?? []), line]);
  }

  const addresses = new Set<string>([
    ...deployment.accounts.map((account) => account.address),
    ...[...batches.values()].flatMap((batch) => [batch.owner, batch.registrant]),
    ...timeline.map((event) => event.args.actor),
    ...recipients.values(),
  ]);
  const roles = new Map<string, Role[]>(
    await Promise.all(
      [...addresses].map(async (address) => {
        const held = await Promise.all(ROLES.map((role) => contract.hasRole(ROLE_ID[role], address)));
        return [address.toLowerCase(), ROLES.filter((_, i) => held[i])] as const;
      }),
    ),
  );

  return { batches, lines, roles };
}

/** Rollen van een willekeurig adres, ook als het nog niet in de snapshot staat. */
export async function rolesOf(contract: MaterialPassport, address: string): Promise<Role[]> {
  const held = await Promise.all(ROLES.map((role) => contract.hasRole(ROLE_ID[role], address)));
  return ROLES.filter((_, i) => held[i]);
}
