/**
 * Ruwe blokken en transacties van de keten, voor de ontwikkelaarsweergave. De
 * aanroep en events worden gedecodeerd met de ABI van het contract, zodat je
 * ziet wat er werkelijk op de keten staat, los van hoe de app het samenvat.
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
  /** Aangeroepen contractfunctie met argumenten. */
  call?: { name: string; params: Decoded[] };
  /** Adres van een contract dat in deze transactie is uitgerold. */
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

/** Blokken `lowest` t/m `highest`, nieuwste eerst. */
export async function loadBlocks(
  provider: JsonRpcProvider,
  contractInterface: Interface,
  contractAddress: string,
  highest: number,
  lowest: number,
): Promise<ChainBlock[]> {
  const isContract = (address: string | null) => address?.toLowerCase() === contractAddress.toLowerCase();
  const numbers = Array.from({ length: highest - lowest + 1 }, (_, i) => highest - i);

  return Promise.all(
    numbers.map(async (number) => {
      const block = await provider.getBlock(number, true);
      if (!block) throw new Error(`Blok ${number} niet gevonden`);
      const txs = await Promise.all(
        block.prefetchedTransactions.map(async (tx): Promise<ChainTx> => {
          const receipt = await provider.getTransactionReceipt(tx.hash);
          const call = isContract(tx.to) ? contractInterface.parseTransaction({ data: tx.data, value: tx.value }) : null;
          const events = (receipt?.logs ?? [])
            .filter((log) => isContract(log.address))
            .map((log) => contractInterface.parseLog(log))
            .filter((parsed) => parsed !== null)
            .map((parsed) => ({ name: parsed.name, params: decode(parsed.fragment.inputs, parsed.args) }));
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
