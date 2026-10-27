import { useEffect, useState } from "react";
import { loadDeclaration, type DeclarationResult } from "../lib/api";
import { REPAIR_LABEL } from "../lib/circularity";
import { ClaimType, type Claim } from "../lib/domain";
import { formatDateTime } from "../lib/format";
import { Address, HashValue } from "./ui";

/**
 * Circularity and environmental information of a batch (requirement 3).
 * The data is read from the off-chain store and checked here, in the browser,
 * against the hash of the latest CircularityInfo claim on the chain.
 */
export function CircularityPanel({ claims }: { claims: Claim[] }) {
  const latest = [...claims].reverse().find((claim) => claim.claimType === ClaimType.CircularityInfo);
  const hash = latest?.documentHash;
  const [result, setResult] = useState<DeclarationResult | null>(null);

  useEffect(() => {
    setResult(null);
    if (!hash) return;
    let current = true;
    void loadDeclaration(hash).then((loaded) => current && setResult(loaded));
    return () => {
      current = false;
    };
  }, [hash]);

  if (!latest || !hash) {
    return <p className="muted">Er is nog geen circulariteits- of milieu-informatie aan deze batch toegevoegd.</p>;
  }
  if (!result) return <p className="muted">Laden…</p>;

  const recorded = (
    <p className="muted">
      Claim #{latest.index} · <time>{formatDateTime(latest.timestamp)}</time> · door <Address value={latest.submitter} />
    </p>
  );

  if (result.state === "verified") {
    const { declaration: d } = result;
    return (
      <>
        <p role="status">✓ De opgeslagen verklaring komt overeen met de hash op de Chain.</p>
        {recorded}
        <dl className="details">
          <dt>Herbruikbaar zoals het is</dt>
          <dd>{d.reusablePercent}%</dd>
          <dt>Recyclebaar</dt>
          <dd>{d.recyclablePercent}%</dd>
          <dt>Gerecycled aandeel</dt>
          <dd>{d.recycledContentPercent}%</dd>
          <dt>Reparatie</dt>
          <dd>{REPAIR_LABEL[d.repairability]}</dd>
          <dt>Restwaarde</dt>
          <dd>€ {d.residualValueEur.toLocaleString("nl-NL")}</dd>
          <dt>CO₂-impact (A1–A3)</dt>
          <dd>{d.environment.gwpA1A3KgCo2ePerKg} kg CO₂-eq per kg</dd>
          {d.environment.epdHash && (
            <>
              <dt>EPD-hash</dt>
              <dd>
                <HashValue value={d.environment.epdHash} />
              </dd>
            </>
          )}
          <dt>Vervolgtoepassingen</dt>
          <dd>{d.nextApplications.join(", ")}</dd>
        </dl>
      </>
    );
  }

  return (
    <>
      {recorded}
      {result.state === "mismatch" && (
        <p className="warning" role="alert">
          De opgeslagen verklaring komt niet overeen met de hash op de Chain. Ze is dus gewijzigd na het vastleggen. Vertrouw er niet op.
        </p>
      )}
      {result.state === "document-missing" && (
        <p className="warning" role="alert">
          De verklaring staat vastgelegd op de Chain, maar het document zelf staat niet in de opslag. De hash is <HashValue value={hash} />.
        </p>
      )}
      {result.state === "invalid" && (
        <p className="warning" role="alert">
          Het document komt overeen met de hash, maar is geen geldige verklaring. Technische details: {result.problems.join(" ")}
        </p>
      )}
      {result.state === "unavailable" && (
        <p className="warning" role="alert">
          De documentopslag is niet bereikbaar, dus de verklaring kan nu niet worden getoond.
        </p>
      )}
    </>
  );
}
