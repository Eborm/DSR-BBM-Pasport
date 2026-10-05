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
        <h1>Verify document</h1>
        <p>
          No ClaimRegistry is deployed. Stop the demo and start it again with <code>npm run demo</code>.
        </p>
      </div>
    );
  }

  return (
    <div className="form">
      <h1>Verify document</h1>
      <p>
        Choose a document to check whether a claim has been recorded for it
        {id !== undefined ? ` for batch #${id.toString()}` : " for any batch"}. The file is hashed in your browser and
        never leaves your device.
      </p>
      {id !== undefined && (
        <p className="help">
          <a href={href.verify()}>Search all batches</a>
        </p>
      )}

      <label className="field">
        <span>Document</span>
        <input type="file" onChange={(e) => void choose(e.target.files?.[0] ?? null)} />
      </label>

      <div className="outcome" aria-live="polite">
        {busy && <p className="muted">Calculating hash…</p>}
        {failed && <p className="field-error">This file could not be read. Choose it again.</p>}

        {hash && file && !snapshot && <p className="muted">Loading claims…</p>}

        {hash && file && snapshot && (
          <>
            {matches.length > 0 ? (
              <div className="verification-outcome ok">
                <p className="verification ok">
                  <span className="verification-icon" aria-hidden="true">
                    ✓
                  </span>
                  This document is recorded
                </p>
                <p>
                  The hash of {file.name} matches {matches.length === 1 ? "one claim" : `${matches.length} claims`} on the
                  chain.
                </p>
              </div>
            ) : (
              <div className="verification-outcome error">
                <p className="verification error">
                  <span className="verification-icon" aria-hidden="true">
                    ✕
                  </span>
                  No claim found for this document
                </p>
                <p>
                  No claim has this hash. Either the document was never recorded, or the file has changed since then, even if
                  only by a single character.
                </p>
              </div>
            )}

            <p className="computed-hash">
              <span className="muted">Hash of {file.name} (keccak256)</span>
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
