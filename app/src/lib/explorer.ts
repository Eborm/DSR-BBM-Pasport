/**
 * Raw blocks and transactions from the chain, for the developer view. The
 * call and events are decoded with the contract's ABI, so you see what is
 * actually on the chain, independent of how the app summarizes it.
 */
import type { Interface, JsonRpcProvider, ParamType, Result } from "ethers";

export interface Decoded {
  name: string;
  type: ParamType;
  value: unknown;
}

export interface ChainTx {
  hash: string;
  from: string;
  to: string | null;
  ok: boolean;
  gasUsed: bigint;
  /** Called contract function with arguments. */
  call?: { name: string; params: Decoded[] };
  /** Address of a contract deployed in this transaction. */
  deployed?: string;
  events: { name: string; params: Decoded[] }[];
}

export interface ChainBlock {
  number: number;
  hash: string;
  parentHash: string;
  timestamp: number;
  txs: ChainTx[];
}

const decode = (inputs: readonly ParamType[], values: Result): Decoded[] =>
  inputs.map((type, index) => ({ name: type.name, type, value: values[index] }));

export interface ChainContract {
  interface: Interface;
  address: string;
}

/** Blocks `lowest` through `highest`, newest first. Calls and events of every given contract are decoded. */
export async function loadBlocks(
  provider: JsonRpcProvider,
  contracts: ChainContract[],
  highest: number,
  lowest: number,
): Promise<ChainBlock[]> {
  const find = (address: string | null) => contracts.find((c) => c.address.toLowerCase() === address?.toLowerCase());
  const numbers = Array.from({ length: highest - lowest + 1 }, (_, i) => highest - i);

  return Promise.all(
    numbers.map(async (number) => {
      const block = await provider.getBlock(number, true);
      if (!block) throw new Error(`Block ${number} not found`);
      const txs = await Promise.all(
        block.prefetchedTransactions.map(async (tx): Promise<ChainTx> => {
          const receipt = await provider.getTransactionReceipt(tx.hash);
          const target = find(tx.to);
          const call = target ? target.interface.parseTransaction({ data: tx.data, value: tx.value }) : null;
          const events = (receipt?.logs ?? []).flatMap((log) => {
            const emitter = find(log.address);
            const parsed = emitter?.interface.parseLog(log);
            return parsed ? [{ name: parsed.name, params: decode(parsed.fragment.inputs, parsed.args) }] : [];
          });
          return {
            hash: tx.hash,
            from: tx.from,
            to: tx.to,
            ok: receipt?.status === 1,
            gasUsed: receipt?.gasUsed ?? 0n,
            call: call ? { name: call.name, params: decode(call.fragment.inputs, call.args) } : undefined,
            deployed: receipt?.contractAddress ?? undefined,
            events,
          };
        }),
      );
      return { number: block.number, hash: block.hash!, parentHash: block.parentHash, timestamp: block.timestamp, txs };
    }),
  );
}
