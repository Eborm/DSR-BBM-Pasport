import { useEffect, useRef, useState } from "react";
import { NotImplemented, RoleBadge } from "./components/ui";
import { loadDeployment, type Deployment } from "./lib/chain";
import { shortAddress } from "./lib/format";
import { href, parseRoute, useHash } from "./lib/router";
import { AddClaim } from "./screens/AddClaim";
import { BatchDetail } from "./screens/BatchDetail";
import { Chain } from "./screens/Chain";
import { Overview } from "./screens/Overview";
import { Register } from "./screens/Register";
import { Verify } from "./screens/Verify";
import { PassportProvider, usePassport } from "./state";

export function App() {
  const [deployment, setDeployment] = useState<Deployment | null | "missing">(null);

  useEffect(() => {
    loadDeployment().then(
      (found) => setDeployment(found ?? "missing"),
      () => setDeployment("missing"),
    );
  }, []);

  if (deployment === null) return null;
  if (deployment === "missing") return <NotStarted />;
  return (
    <PassportProvider deployment={deployment}>
      <Layout />
    </PassportProvider>
  );
}

function Layout() {
  const hash = useHash();
  const route = parseRoute(hash);
  const { error, reload, developer } = usePassport();
  const main = useRef<HTMLElement>(null);

  // Move focus to the content on every new screen, for keyboard and screen reader users.
  useEffect(() => {
    main.current?.focus();
    window.scrollTo(0, 0);
  }, [hash]);

  const active = (screen: string) =>
    route.screen === screen || (screen === "overview" && ["batch", "claim", "transfer", "register"].includes(route.screen))
      ? "page"
      : undefined;

  return (
    <>
      {/* Not a plain anchor link: the hash belongs to the router. */}
      <a
        className="skip-link"
        href="#content"
        onClick={(e) => {
          e.preventDefault();
          main.current?.focus();
        }}
      >
        Ga naar inhoud
      </a>
      <header className="topbar">
        <a className="brand" href={href.overview()}>
          BBM-paspoort
        </a>
        <nav aria-label="Hoofdmenu">
          <a href={href.overview()} aria-current={active("overview")}>
            Overzicht
          </a>
          <a href={href.register()} aria-current={active("register")}>
            Registreren
          </a>
          <a href={href.scan()} aria-current={active("scan")}>
            Scannen
          </a>
          <a href={href.verify()} aria-current={active("verify")}>
            Controleren
          </a>
          {developer && (
            <a href={href.chain()} aria-current={active("chain")}>
              Keten
            </a>
          )}
        </nav>
        <WalletPicker />
        <DeveloperSwitch />
      </header>

      {error && (
        <div className="connection" role="alert">
          <p>
            <strong>Geen verbinding met de keten.</strong> {error}
          </p>
          <button type="button" className="button small" onClick={() => void reload()}>
            Opnieuw proberen
          </button>
        </div>
      )}

      <main id="content" ref={main} tabIndex={-1}>
        <Screen route={route} />
      </main>
    </>
  );
}

function Screen({ route }: { route: ReturnType<typeof parseRoute> }) {
  switch (route.screen) {
    case "overview":
      return <Overview />;
    case "batch":
      return <BatchDetail key={route.id.toString()} id={route.id} />;
    case "claim":
      return <AddClaim key={route.id.toString()} id={route.id} />;
    case "transfer":
      return <NotImplemented what={route.mode === "split" ? "Split batch" : "Transfer ownership"} />;
    case "register":
      return <Register />;
    case "scan":
      return <NotImplemented what="Scan QR code" />;
    case "verify":
      return <Verify key={route.id?.toString() ?? "all"} id={route.id} />;
    case "chain":
      return <Chain focus={route.block} />;
    default:
      return (
        <div className="empty">
          <h1>Page not found</h1>
          <a className="button" href={href.overview()}>
            Back to the overview
          </a>
        </div>
      );
  }
}

/**
 * The role follows from the chosen account; there is no login screen.
 * In the demo you pick one of the local chain's test accounts.
 */
function WalletPicker() {
  const { deployment, account, selectAccount, role } = usePassport();
  return (
    <div className="wallet">
      <label>
        <span className="wallet-label">Account</span>
        <select value={account?.address ?? ""} onChange={(e) => selectAccount(e.target.value || null)}>
          <option value="">Geen account (alleen lezen)</option>
          {deployment.accounts.map((a) => (
            <option key={a.address} value={a.address}>
              {a.name}
            </option>
          ))}
        </select>
      </label>
      <p className="wallet-status" aria-live="polite">
        {account && (
          <>
            <code title={account.address}>{shortAddress(account.address)}</code> <RoleBadge role={role ?? undefined} />
          </>
        )}
      </p>
    </div>
  );
}

/**
 * Developer view: makes visible that everything comes from the chain (block
 * and transaction per line, "Chain" screen). For demos, not for end users.
 */
function DeveloperSwitch() {
  const { developer, setDeveloper, blockNumber } = usePassport();
  return (
    <div className="developer">
      <label className="switch">
        <input type="checkbox" role="switch" checked={developer} onChange={(e) => setDeveloper(e.target.checked)} />
        <span className="switch-track" aria-hidden="true" />
        Developer
      </label>
      {developer && blockNumber !== null && (
        <a className="block-counter" href={href.chain()} title="Highest block of the chain, updated live">
          <span className="live" aria-hidden="true" />
          block #{blockNumber}
        </a>
      )}
    </div>
  );
}

function NotStarted() {
  return (
    <main className="not-started">
      <h1>BBM passport</h1>
      <p>The demo has not been started: no deployed contract was found.</p>
      <p>Start the demo in a terminal in the project folder:</p>
      <pre>npm run demo</pre>
      <p className="muted">This starts the local chain, the demo data, and then this app.</p>
    </main>
  );
}
