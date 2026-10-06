import { useMemo, useState } from "react";
import { Address, ClaimRoleBadge, HashValue } from "../components/ui";
import { CLAIM_TYPE_LABEL, type Claim } from "../lib/domain";
import { formatDateTime } from "../lib/format";
import { hashFile } from "../lib/hash";
import { href } from "../lib/router";
import { usePassport } from "../state";

/**
 * Screen E: check a document against the claims on the chain. The file is
 * hashed in the browser and compared with the hashes in ClaimRegistry; a
 * single changed byte gives a different hash, so no match means the document
 * is not the one that was registered.
 */
export function Verify({ id }: { id?: bigint }) {
  const { snapshot, claims, claimRoleOf } = usePassport();
  const [file, setFile] = useState<File | null>(null);
  const [hash, setHash] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);

  const matches = useMemo(() => {
    if (!hash || !snapshot) return [];
    const found: Claim[] = [];
    for (const [batchId, list] of snapshot.claims) {
      if (id !== undefined && batchId !== id) continue;
      for (const claim of list) if (claim.documentHash.toLowerCase() === hash) found.push(claim);
    }
    return found;
  }, [hash, snapshot, id]);

  async function choose(next: File | null) {
    setFile(next);
    setHash(null);
    setFailed(false);
    if (!next) return;
    setBusy(true);
    try {
      setHash((await hashFile(next)).toLowerCase());
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  if (!claims) {
    return (
      <div className="empty">
        <h1>verifier document</h1>
        <p>
          Geen ClaimRegistry gedeployed. Stop de demo en start hem opnieuw met <code>npm run demo</code>.
        </p>
      </div>
    );
  }

  return (
    <div className="form">
      <h1>verifier document</h1>
      <p>
        Kies een document om te checken of deze in een claim is opgenomen
        {id !== undefined ? ` voor batch #${id.toString()}` : " voor elke batch"}. Het bestand wordt in je browser gehashed
        en verlaat nooit je device
      </p>
      {id !== undefined && (
        <p className="help">
          <a href={href.verify()}>Zoek in all batches</a>
        </p>
      )}

      <label className="field">
        <span>Document</span>
        <input type="file" onChange={(e) => void choose(e.target.files?.[0] ?? null)} />
      </label>

      <div className="outcome" aria-live="polite">
        {busy && <p className="muted">Hash berekenen…</p>}
        {failed && <p className="field-error">Dit bestand kon niet gelezen worden. Kies opnieuw een bestand</p>}

        {hash && file && !snapshot && <p className="muted">Claims laden…</p>}

        {hash && file && snapshot && (
          <>
            {matches.length > 0 ? (
              <div className="verification-outcome ok">
                <p className="verification ok">
                  <span className="verification-icon" aria-hidden="true">
                    ✓
                  </span>
                  Dit document is opgenomen in de blockchain
                </p>
                <p>
                  De hash van {file.name} matcht {matches.length === 1 ? "een claim" : `${matches.length} claims`} op de
                  chain.
                </p>
              </div>
            ) : (
              <div className="verification-outcome error">
                <p className="verification error">
                  <span className="verification-icon" aria-hidden="true">
                    ✕
                  </span>
                  Geen claim gevonden in voor dit document
                </p>
                <p>
                  Geen claim met deze hash. Het document is nooit opgenomen in de blockchain of dit bestand is veranderd sinds dan.
                </p>
              </div>
            )}

            <p className="computed-hash">
              <span className="muted">Hash van {file.name} (keccak256)</span>
              <br />
              <HashValue value={hash} full />
            </p>

            {matches.length > 0 && (
              <ul className="recorded">
                {matches.map((claim) => (
                  <li key={`${claim.batchId}-${claim.index}`}>
                    <strong>{CLAIM_TYPE_LABEL[claim.claimType]}</strong> on{" "}
                    <a href={href.batch(claim.batchId)}>batch #{claim.batchId.toString()}</a> (claim #{claim.index}),{" "}
                    {formatDateTime(claim.timestamp)}, by <Address value={claim.submitter} />{" "}
                    <ClaimRoleBadge role={claimRoleOf(claim.submitter)} />
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </div>
  );
}
