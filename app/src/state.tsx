import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { JsonRpcProvider } from "ethers";
import {
  connect,
  loadSnapshot,
  writableContract,
  type DemoAccount,
  type Deployment,
  type MaterialPassport,
  type Snapshot,
} from "./lib/chain";
import type { Role } from "./lib/domain";
import { explainError } from "./lib/errors";

interface PassportContextValue {
  deployment: Deployment;
  provider: JsonRpcProvider;
  /** Alleen-lezen verbinding; voor iedereen, ook zonder wallet. */
  contract: MaterialPassport;
  snapshot: Snapshot | null;
  error: string | null;
  reload: () => Promise<void>;
  /** Hoogste bloknummer van de keten, live bijgewerkt. */
  blockNumber: number | null;
  account: DemoAccount | null;
  selectAccount: (address: string | null) => void;
  /** Rollen van het verbonden adres, of `null` als er geen wallet verbonden is. */
  roles: Role[] | null;
  /** Contract waarmee het verbonden adres transacties tekent. */
  writer: () => Promise<MaterialPassport>;
  nameOf: (address: string) => string | undefined;
  rolesOf: (address: string) => Role[];
  /** Ontwikkelaarsweergave: blokken en transacties zichtbaar maken. */
  developer: boolean;
  setDeveloper: (on: boolean) => void;
}

const PassportContext = createContext<PassportContextValue | null>(null);

export function usePassport() {
  const value = useContext(PassportContext);
  if (!value) throw new Error("usePassport buiten PassportProvider");
  return value;
}

// Voorkeuren per browser. Opslaan is een gemak, geen vereiste.
const WALLET_KEY = "bbm-paspoort.wallet";
const DEVELOPER_KEY = "bbm-paspoort.ontwikkelaar";

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
    // Zie hierboven.
  }
}

export function PassportProvider({ deployment, children }: { deployment: Deployment; children: ReactNode }) {
  const { provider, contract } = useMemo(() => connect(deployment), [deployment]);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [blockNumber, setBlockNumber] = useState<number | null>(null);
  const [address, setAddress] = useState<string | null>(() => readSetting(WALLET_KEY));
  const [developer, setDeveloperState] = useState(() => readSetting(DEVELOPER_KEY) === "aan");
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
      if (mine === sequence.current) setError(explainError(e).message);
    }
  }, [contract, deployment]);

  // Elke seconde het bloknummer opvragen en bij een nieuw blok alles opnieuw
  // lezen, zodat een handeling in een ander venster of met een andere rol
  // direct zichtbaar wordt.
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
        // Keten onbereikbaar: reload toont de fout; bij herstel opnieuw laden.
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
    writeSetting(DEVELOPER_KEY, on ? "aan" : null);
  }, []);

  const rolesOf = useCallback((a: string) => snapshot?.roles.get(a.toLowerCase()) ?? [], [snapshot]);
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
    roles: account ? rolesOf(account.address) : null,
    writer: async () => {
      if (!account) throw new Error("Geen wallet verbonden.");
      return writableContract(provider, account.address, deployment);
    },
    nameOf,
    rolesOf,
    developer,
    setDeveloper,
  };

  return <PassportContext.Provider value={value}>{children}</PassportContext.Provider>;
}
