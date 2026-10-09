import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Contract, type JsonRpcProvider } from "ethers";
import {
  connect,
  loadSnapshot,
  writableContract,
  type DemoAccount,
  type Deployment,
  type Snapshot,
} from "./lib/chain";
import type { Role } from "./lib/domain";

interface PassportContextValue {
  deployment: Deployment;
  provider: JsonRpcProvider;
  /** Read-only connection; available to everyone, even without a chosen account. */
  contract: Contract;
  snapshot: Snapshot | null;
  error: string | null;
  reload: () => Promise<void>;
  /** Highest block number of the chain, updated live. */
  blockNumber: number | null;
  account: DemoAccount | null;
  selectAccount: (address: string | null) => void;
  /** Role of the chosen account, or `null` if no account is chosen. */
  role: Role | null;
  /** Contract with which the chosen account signs transactions. */
  writer: () => Promise<Contract>;
  nameOf: (address: string) => string | undefined;
  roleOf: (address: string) => Role | undefined;
  /** Developer view: makes block/transaction details visible (Chain screen). */
  developer: boolean;
  setDeveloper: (on: boolean) => void;
}

const PassportContext = createContext<PassportContextValue | null>(null);

export function usePassport() {
  const value = useContext(PassportContext);
  if (!value) throw new Error("usePassport used outside PassportProvider");
  return value;
}

// Per-browser preferences. Persisting these is a convenience, not a requirement.
const WALLET_KEY = "bbm-passport.wallet";
const DEVELOPER_KEY = "bbm-passport.developer";

function readSetting(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeSetting(key: string, value: string | null) {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    // See above.
  }
}

export function PassportProvider({ deployment, children }: { deployment: Deployment; children: ReactNode }) {
  const { provider, contract } = useMemo(() => connect(deployment), [deployment]);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [blockNumber, setBlockNumber] = useState<number | null>(null);
  const [address, setAddress] = useState<string | null>(() => readSetting(WALLET_KEY));
  const [developer, setDeveloperState] = useState(() => readSetting(DEVELOPER_KEY) === "on");
  const sequence = useRef(0);

  const reload = useCallback(async () => {
    const mine = ++sequence.current;
    try {
      const next = await loadSnapshot(contract, deployment);
      if (mine === sequence.current) {
        setSnapshot(next);
        setError(null);
      }
    } catch (e) {
      if (mine === sequence.current) setError(e instanceof Error ? e.message : String(e));
    }
  }, [contract, deployment]);

  // Poll the block number every second and reload on a new block, so an
  // action from another window or account becomes visible right away.
  useEffect(() => {
    let last = -1;
    let stopped = false;
    const poll = async () => {
      try {
        const number = await provider.getBlockNumber();
        if (stopped || number === last) return;
        last = number;
        setBlockNumber(number);
        await reload();
      } catch {
        // Chain unreachable: reload surfaces the error; retry once it's back.
        last = -1;
        if (!stopped) await reload();
      }
    };
    void poll();
    const timer = setInterval(poll, 1000);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [provider, reload]);

  const account = deployment.accounts.find((a) => a.address.toLowerCase() === address?.toLowerCase()) ?? null;

  const selectAccount = useCallback((next: string | null) => {
    setAddress(next);
    writeSetting(WALLET_KEY, next);
  }, []);

  const setDeveloper = useCallback((on: boolean) => {
    setDeveloperState(on);
    writeSetting(DEVELOPER_KEY, on ? "on" : null);
  }, []);

  const roleOf = useCallback((a: string) => snapshot?.roles.get(a.toLowerCase()), [snapshot]);
  const nameOf = useCallback(
    (a: string) => deployment.accounts.find((account) => account.address.toLowerCase() === a.toLowerCase())?.name,
    [deployment],
  );

  const value: PassportContextValue = {
    deployment,
    provider,
    contract,
    snapshot,
    error,
    reload,
    blockNumber,
    account,
    selectAccount,
    role: account ? (roleOf(account.address) ?? null) : null,
    writer: async () => {
      if (!account) throw new Error("No account chosen.");
      return writableContract(provider, account.address, deployment);
    },
    nameOf,
    roleOf,
    developer,
    setDeveloper,
  };

  return <PassportContext.Provider value={value}>{children}</PassportContext.Provider>;
}
