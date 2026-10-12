import { useMemo, useState } from "react";
import { Address, HashValue, RoleBadge } from "../components/ui";
import { CLAIM_TYPE_LABEL, type Claim } from "../lib/domain";
import { formatDateTime } from "../lib/format";
import { hashFile } from "../lib/hash";
import { href } from "../lib/router";
import { usePassport } from "../state";

/**
 * Screen E: check a document against the claims on the chain. The file is
 * hashed in the browser and compared with the hashes of the claims in MaterialPassport; a
 * single changed byte gives a different hash, so no match means the document
 * is not the one that was registered.
 */
export function Verify({ id }: { id?: bigint }) {
  const { snapshot, roleOf } = usePassport();
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

  return (
    <div className="form">
      <h1>Document controleren</h1>
      <p>
        Kies een document om te controleren of dit in een claim is opgenomen
        {id !== undefined ? ` voor batch #${id.toString()}` : " voor elke batch"}. Het bestand wordt in je browser gehashed
        en verlaat nooit je apparaat.
      </p>
      {id !== undefined && (
        <p className="help">
          <a href={href.verify()}>Zoek in alle batches</a>
        </p>
      )}

      <label className="field">
        <span>Document</span>
        <input type="file" onChange={(e) => void choose(e.target.files?.[0] ?? null)} />
      </label>

      <div className="outcome" aria-live="polite">
        {busy && <p className="muted">Hash berekenen…</p>}
        {failed && <p className="field-error">Dit bestand kon niet worden gelezen. Kies opnieuw een bestand.</p>}

        {hash && file && !snapshot && <p className="muted">Claims laden…</p>}

        {hash && file && snapshot && (
          <>
            {matches.length > 0 ? (
              <div className="verification-outcome ok">
                <p className="verification ok">
                  <span className="verification-icon" aria-hidden="true">
                    ✓
                  </span>
                  Dit document is opgenomen in de blockchain.
                </p>
                <p>
                  De hash van {file.name} komt overeen met {matches.length === 1 ? "een claim" : `${matches.length} claims`} op de
                  Chain.
                </p>
              </div>
            ) : (
              <div className="verification-outcome error">
                <p className="verification error">
                  <span className="verification-icon" aria-hidden="true">
                    ✕
                  </span>
                  Geen claim gevonden voor dit document.
                </p>
                <p>
                  Geen claim met deze hash. Het document is nooit opgenomen in de blockchain, of dit bestand is sindsdien gewijzigd.
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
                    <strong>{CLAIM_TYPE_LABEL[claim.claimType]}</strong> op{" "}
                    <a href={href.batch(claim.batchId)}>batch #{claim.batchId.toString()}</a> (claim #{claim.index}),{" "}
                    {formatDateTime(claim.timestamp)}, door <Address value={claim.submitter} />{" "}
                    <RoleBadge role={roleOf(claim.submitter)} />
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
