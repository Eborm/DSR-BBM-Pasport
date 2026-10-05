import { useEffect, useMemo, useState, type FormEvent } from "react";
import { ErrorBox, HashValue, Steps, SubmitButton, type Step } from "../components/ui";
import {
  CLAIM_TYPE_LABEL,
  CLAIM_TYPES,
  ClaimType,
  allowedRolesLabel,
  canAddClaim,
  claimTypesFor,
} from "../lib/domain";
import { explainError, type Explained } from "../lib/errors";
import { hashFile, isHash, ZERO_HASH } from "../lib/hash";
import { href } from "../lib/router";
import { usePassport } from "../state";

/** Screen D: add a claim to a batch. The document itself stays in the browser; only its hash goes on the chain. */
export function AddClaim({ id }: { id: bigint }) {
  const { snapshot, claims, claimRole, claimWriter, reload } = usePassport();
  const [type, setType] = useState<ClaimType>(ClaimType.StatusChange);
  const [file, setFile] = useState<File | null>(null);
  const [fileHash, setFileHash] = useState<string | null>(null);
  const [manualHash, setManualHash] = useState("");
  const [hashing, setHashing] = useState(false);
  const [hashError, setHashError] = useState<string | null>(null);
  const [steps, setSteps] = useState<Step[]>([]);
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<Explained | null>(null);
  const [added, setAdded] = useState<{ index: number; hash: string; tx: string } | null>(null);

  // Start on a claim type the chosen account may actually add.
  const allowedTypes = claimTypesFor(claimRole);
  useEffect(() => {
    if (allowedTypes.length > 0 && !allowedTypes.includes(type)) setType(allowedTypes[0]);
    // Only when the account (and so the role) changes, not on every choice of type.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claimRole]);

  // A chosen file wins over a typed hash.
  const hash = fileHash ?? (manualHash.trim() ? manualHash.trim().toLowerCase() : null);
  const hashProblem = useMemo(() => {
    if (hash === null) return null;
    if (!isHash(hash)) return "A hash is 0x followed by 64 hexadecimal characters.";
    if (hash === ZERO_HASH) return "A hash of only zeros is not allowed.";
    return null;
  }, [hash]);

  const permission = canAddClaim(claimRole, type);
  const batch = snapshot?.batches.get(id);
  const existing = hash && !hashProblem ? snapshot?.claims.get(id)?.find((c) => c.documentHash.toLowerCase() === hash) : undefined;

  async function chooseFile(next: File | null) {
    setFile(next);
    setFileHash(null);
    setHashError(null);
    if (!next) return;
    setHashing(true);
    try {
      setFileHash(await hashFile(next));
    } catch {
      setHashError("This file could not be read. Choose it again.");
    } finally {
      setHashing(false);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setFailure(null);
    if (!claims || !hash || hashProblem || !permission.allowed) return;

    const update = (index: number, step: Partial<Step>) =>
      setSteps((current) => current.map((s, i) => (i === index ? { ...s, ...step } : s)));
    setSteps([{ title: "Send transaction", state: "busy" }]);
    setPending(true);

    try {
      const registry = await claimWriter();
      const tx = await registry.addClaim(id, type, hash);
      const receipt = await tx.wait();
      const claimEvent = receipt?.logs
        .map((log: any) => {
          try {
            return claims.interface.parseLog(log);
          } catch {
            return null;
          }
        })
        .find((parsed: any) => parsed?.name === "ClaimAdded");
      update(0, { state: "done", detail: <p className="muted">Transaction {tx.hash.slice(0, 10)}… confirmed</p> });
      await reload();
      setAdded({
        index: claimEvent ? Number(claimEvent.args.claimIndex) : (snapshot?.claims.get(id)?.length ?? 0),
        hash,
        tx: tx.hash,
      });
    } catch (error) {
      update(0, { state: "failed" });
      setFailure(explainError(error, claims.interface));
    } finally {
      setPending(false);
    }
  }

  if (!snapshot) return <p className="muted">Laden...</p>;

  if (!batch) {
    return (
      <div className="empty">
        <h1>Batch #{id.toString()} not found</h1>
        <a className="button" href={href.overview()}>
          Back to the overview
        </a>
      </div>
    );
  }

  if (!claims) {
    return (
      <div className="empty">
        <h1>Add claim</h1>
        <p>
          No ClaimRegistry is deployed. Stop the demo and start it again with <code>npm run demo</code>.
        </p>
      </div>
    );
  }

  if (added) {
    return (
      <div className="result">
        <h1>Claim #{added.index} added to batch #{id.toString()}</h1>
        <div className="result-content">
          <div>
            <p className="instruction">
              The hash of the document is now fixed on the chain. Keep the original file safe: anyone who wants to check
              it later needs exactly this file.
            </p>
            <p>
              <span className="muted">Document hash</span> <HashValue value={added.hash} />
            </p>
            <div className="buttons">
              <a className="button primary" href={href.batch(id)}>
                Go to batch #{id.toString()}
              </a>
              <button
                type="button"
                className="button"
                onClick={() => {
                  setAdded(null);
                  setSteps([]);
                  void chooseFile(null);
                  setManualHash("");
                }}
              >
                Add another claim
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const noHash = hash === null;

  return (
    <form className="form" onSubmit={submit} noValidate>
      <h1>Add claim to batch #{id.toString()}</h1>
      <p className="muted">
        {batch.materialType} · {batch.producer}
      </p>
      {!permission.allowed && (
        <p className="reason block" role="note">
          {permission.reason}
        </p>
      )}

      <fieldset disabled={pending}>
        <label className="field">
          <span>Claim type *</span>
          <select value={type} onChange={(e) => setType(Number(e.target.value) as ClaimType)}>
            {CLAIM_TYPES.map((t) => (
              <option key={t} value={t}>
                {CLAIM_TYPE_LABEL[t]}
              </option>
            ))}
          </select>
          <span className="help">Can be added by: {allowedRolesLabel(type)}.</span>
        </label>

        <label className="field">
          <span>Document *</span>
          <input type="file" onChange={(e) => void chooseFile(e.target.files?.[0] ?? null)} />
          <span className="help">
            The file is hashed in your browser and never leaves your device. Only the hash is put on the chain.
          </span>
        </label>

        {hashing && <p className="muted">Calculating hash…</p>}
        {hashError && <p className="field-error">{hashError}</p>}
        {fileHash && file && (
          <div className="computed-hash">
            <p className="muted">Hash of {file.name} (keccak256)</p>
            <HashValue value={fileHash} full />
          </div>
        )}

        {!file && (
          <details>
            <summary className="muted">Or enter a hash yourself</summary>
            <label className="field">
              <span>Document hash</span>
              <input
                value={manualHash}
                onChange={(e) => setManualHash(e.target.value)}
                placeholder="0x…"
                spellCheck={false}
                autoComplete="off"
                aria-invalid={!!hashProblem}
                aria-describedby={hashProblem ? "error-hash" : undefined}
              />
              {hashProblem && (
                <span className="field-error" id="error-hash">
                  {hashProblem}
                </span>
              )}
            </label>
          </details>
        )}

        {existing && (
          <p className="warning" role="note">
            This document is already recorded as claim #{existing.index} ({CLAIM_TYPE_LABEL[existing.claimType].toLowerCase()}) on this
            batch. You can record it again, but claims cannot be changed or removed.
          </p>
        )}
      </fieldset>

      {steps.length > 0 && <Steps steps={steps} />}
      {failure && <ErrorBox error={failure} />}

      <div className="buttons">
        <SubmitButton pending={pending} disabled={!permission.allowed || noHash || !!hashProblem || hashing}>
          Add claim
        </SubmitButton>
        <a className="button" href={href.batch(id)}>
          Cancel
        </a>
      </div>
      {permission.allowed && noHash && !hashing && (
        <p className="help">Choose a document to be able to add the claim.</p>
      )}
      {/* Keep the rules close at hand for anyone who wonders why a type is refused. */}
      <details className="help">
        <summary>Who can add which claim?</summary>
        <ul>
          {CLAIM_TYPES.map((t) => (
            <li key={t}>
              {CLAIM_TYPE_LABEL[t]}: {allowedRolesLabel(t)}
            </li>
          ))}
        </ul>
      </details>
    </form>
  );
}

