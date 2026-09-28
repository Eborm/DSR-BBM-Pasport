import { useEffect, useRef, useState } from "react";
import { RoleBadges } from "./components/ui";
import { loadDeployment, type Deployment } from "./lib/chain";
import { shortAddress } from "./lib/format";
import { href, parseRoute, useHash } from "./lib/router";
import { AddClaim } from "./screens/AddClaim";
import { BatchDetail } from "./screens/BatchDetail";
import { Chain } from "./screens/Chain";
import { Overview } from "./screens/Overview";
import { Register } from "./screens/Register";
import { Scan } from "./screens/Scan";
import { TransferSplit } from "./screens/TransferSplit";
import { Verify } from "./screens/Verify";
import { PassportProvider, usePassport } from "./state";

export function App() {
  const [deployment, setDeployment] = useState<Deployment | null | "ontbreekt">(null);

  useEffect(() => {
    loadDeployment().then(
      (found) => setDeployment(found ?? "ontbreekt"),
      () => setDeployment("ontbreekt"),
    );
  }, []);

  if (deployment === null) return null;
  if (deployment === "ontbreekt") return <NotStarted />;
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

  // Bij elk nieuw scherm de focus naar de inhoud, voor toetsenbord en schermlezer.
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
      {/* Geen gewone ankerlink: de hash is van de router. */}
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
      return <AddClaim key={route.id.toString()} id={route.id} />;
    case "overdragen":
      return <TransferSplit key={route.id.toString()} id={route.id} mode={route.mode} />;
    case "registreren":
      return <Register />;
    case "scannen":
      return <Scan />;
    case "verifieren":
      return <Verify initialId={route.id} />;
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
 * De rol volgt uit het verbonden adres; er is geen inlogscherm (SPEC §6.1).
 * In de demo kies je een van de testaccounts van de lokale keten.
 */
function WalletPicker() {
  const { deployment, account, selectAccount, roles } = usePassport();
  return (
    <div className="wallet">
      <label>
        <span className="wallet-label">Wallet</span>
        <select value={account?.address ?? ""} onChange={(e) => selectAccount(e.target.value || null)}>
          <option value="">Geen wallet (alleen lezen)</option>
          {deployment.accounts.map((a) => (
            <option key={a.address} value={a.address}>
              {a.name}
            </option>
          ))}
        </select>
      </label>
      {/* Zonder wallet zegt de keuzelijst het al: "Geen wallet (alleen lezen)". */}
      <p className="wallet-status" aria-live="polite">
        {account && (
          <>
            <code title={account.address}>{shortAddress(account.address)}</code> <RoleBadges roles={roles ?? []} />
          </>
        )}
      </p>
    </div>
  );
}

/**
 * Ontwikkelaarsweergave: maakt zichtbaar dat alles uit de keten komt (blok en
 * transactie per tijdlijnregel, scherm "Keten"). Voor demo's, niet voor gebruikers.
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
      <p className="stil">Dat start de lokale keten, de documentopslag en de demodata, en daarna deze app.</p>
    </main>
  );
}
