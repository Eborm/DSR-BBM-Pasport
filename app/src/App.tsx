import { useEffect, useRef, useState } from "react";
import { NotImplemented, RoleBadge } from "./components/ui";
import { loadDeployment, type Deployment } from "./lib/chain";
import { shortAddress } from "./lib/format";
import { href, parseRoute, useHash } from "./lib/router";
import { BatchDetail } from "./screens/BatchDetail";
import { Chain } from "./screens/Chain";
import { Overview } from "./screens/Overview";
import { Register } from "./screens/Register";
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

  // Move focus to the content on every new screen, for keyboard and screen readers.
  useEffect(() => {
    main.current?.focus();
    window.scrollTo(0, 0);
  }, [hash]);

  const active = (screen: string) =>
    route.screen === screen || (screen === "overzicht" && ["batch", "claim", "overdragen", "registreren"].includes(route.screen))
      ? "page"
      : undefined;

  return (
    <>
      {/* Not a plain anchor link: the hash belongs to the router. */}
      <a
        className="overslaan"
        href="#inhoud"
        onClick={(e) => {
          e.preventDefault();
          main.current?.focus();
        }}
      >
        Naar de inhoud
      </a>
      <header className="balk">
        <a className="merk" href={href.overzicht()}>
          BBM-paspoort
        </a>
        <nav aria-label="Hoofdmenu">
          <a href={href.overzicht()} aria-current={active("overzicht")}>
            Overzicht
          </a>
          <a href={href.registreren()} aria-current={active("registreren")}>
            Registreren
          </a>
          <a href={href.scannen()} aria-current={active("scannen")}>
            Scannen
          </a>
          <a href={href.verifieren()} aria-current={active("verifieren")}>
            Verifiëren
          </a>
          {developer && (
            <a href={href.keten()} aria-current={active("keten")}>
              Keten
            </a>
          )}
        </nav>
        <WalletPicker />
        <DeveloperSwitch />
      </header>

      {error && (
        <div className="verbinding" role="alert">
          <p>
            <strong>Geen verbinding met de keten.</strong> {error}
          </p>
          <button type="button" className="knop klein" onClick={() => void reload()}>
            Opnieuw proberen
          </button>
        </div>
      )}

      <main id="inhoud" ref={main} tabIndex={-1}>
        <Screen route={route} />
      </main>
    </>
  );
}

function Screen({ route }: { route: ReturnType<typeof parseRoute> }) {
  switch (route.screen) {
    case "overzicht":
      return <Overview />;
    case "batch":
      return <BatchDetail key={route.id.toString()} id={route.id} />;
    case "claim":
      return <NotImplemented what="Claim toevoegen" />;
    case "overdragen":
      return <NotImplemented what={route.mode === "splitsen" ? "Batch splitsen" : "Eigendom overdragen"} />;
    case "registreren":
      return <Register />;
    case "scannen":
      return <NotImplemented what="QR-code scannen" />;
    case "verifieren":
      return <NotImplemented what="Document verifiëren" />;
    case "keten":
      return <Chain focus={route.block} />;
    default:
      return (
        <div className="leeg">
          <h1>Pagina niet gevonden</h1>
          <a className="knop" href={href.overzicht()}>
            Naar het overzicht
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
    <div className="ontwikkelaar">
      <label className="schakelaar">
        <input type="checkbox" role="switch" checked={developer} onChange={(e) => setDeveloper(e.target.checked)} />
        <span className="schakelaar-baan" aria-hidden="true" />
        Ontwikkelaar
      </label>
      {developer && blockNumber !== null && (
        <a className="blokteller" href={href.keten()} title="Hoogste blok van de keten, live bijgewerkt">
          <span className="live" aria-hidden="true" />
          blok #{blockNumber}
        </a>
      )}
    </div>
  );
}

function NotStarted() {
  return (
    <main className="niet-gestart">
      <h1>BBM-paspoort</h1>
      <p>De demo is nog niet gestart: er is geen uitgerold contract gevonden.</p>
      <p>Start de demo in een terminal in de projectmap:</p>
      <pre>npm run demo</pre>
      <p className="stil">Dat start de lokale keten, de demodata, en daarna deze app.</p>
    </main>
  );
}
