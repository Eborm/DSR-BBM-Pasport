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
  const { snapshot, contract, role, writer, reload } = usePassport();
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
  const allowedTypes = claimTypesFor(role);
  useEffect(() => {
    if (allowedTypes.length > 0 && !allowedTypes.includes(type)) setType(allowedTypes[0]);
    // Only when the account (and so the role) changes, not on every choice of type.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role]);

  // A chosen file wins over a typed hash.
  const hash = fileHash ?? (manualHash.trim() ? manualHash.trim().toLowerCase() : null);
  const hashProblem = useMemo(() => {
    if (hash === null) return null;
    if (!isHash(hash)) return "Een hash bestaat uit 0x gevolgd door 64 hexadecimale tekens.";
    if (hash === ZERO_HASH) return "Een hash met alleen nullen is niet toegestaan.";
    return null;
  }, [hash]);

  const permission = canAddClaim(role, type);
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
      setHashError("Dit bestand kon niet worden gelezen. Kies het opnieuw.");
    } finally {
      setHashing(false);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setFailure(null);
    if (!hash || hashProblem || !permission.allowed) return;

    const update = (index: number, step: Partial<Step>) =>
      setSteps((current) => current.map((s, i) => (i === index ? { ...s, ...step } : s)));
    setSteps([{ title: "Transactie verzenden", state: "busy" }]);
    setPending(true);

    try {
      const registry = await writer();
      const tx = await registry.addClaim(id, type, hash);
      const receipt = await tx.wait();
      const claimEvent = receipt?.logs
        .map((log: any) => {
          try {
            return contract.interface.parseLog(log);
          } catch {
            return null;
          }
        })
        .find((parsed: any) => parsed?.name === "ClaimAdded");
      update(0, { state: "done", detail: <p className="muted">Transactie {tx.hash.slice(0, 10)}… bevestigd</p> });
      await reload();
      setAdded({
        index: claimEvent ? Number(claimEvent.args.claimIndex) : (snapshot?.claims.get(id)?.length ?? 0),
        hash,
        tx: tx.hash,
      });
    } catch (error) {
      update(0, { state: "failed" });
      setFailure(explainError(error, contract.interface));
    } finally {
      setPending(false);
    }
  }

  if (!snapshot) return <p className="muted">Laden...</p>;

  if (!batch) {
    return (
      <div className="empty">
        <h1>Batch #{id.toString()} niet gevonden</h1>
        <a className="button" href={href.overview()}>
          Terug naar het overzicht
        </a>
      </div>
    );
  }

  if (added) {
    return (
      <div className="result">
        <h1>Claim #{added.index} toegevoegd aan batch #{id.toString()}</h1>
        <div className="result-content">
          <div>
            <p className="instruction">
              De hash van het document ligt nu vast op de Chain. Bewaar het originele bestand goed: iedereen die het later
              wil controleren heeft precies dit bestand nodig.
            </p>
            <p>
              <span className="muted">Documenthash</span> <HashValue value={added.hash} />
            </p>
            <div className="buttons">
              <a className="button primary" href={href.batch(id)}>
                Ga naar batch #{id.toString()}
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
                Nog een claim toevoegen
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
      <h1>Claim toevoegen aan batch #{id.toString()}</h1>
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
          <span>Claimtype *</span>
          <select value={type} onChange={(e) => setType(Number(e.target.value) as ClaimType)}>
            {CLAIM_TYPES.map((t) => (
              <option key={t} value={t}>
                {CLAIM_TYPE_LABEL[t]}
              </option>
            ))}
          </select>
          <span className="help">Kan worden toegevoegd door: {allowedRolesLabel(type)}.</span>
        </label>

        <label className="field">
          <span>Document *</span>
          <input type="file" onChange={(e) => void chooseFile(e.target.files?.[0] ?? null)} />
          <span className="help">
            Het bestand wordt in je browser gehashed en verlaat je apparaat nooit. Alleen de hash wordt op de Chain gezet.
          </span>
        </label>

        {hashing && <p className="muted">Hash wordt berekend…</p>}
        {hashError && <p className="field-error">{hashError}</p>}
        {fileHash && file && (
          <div className="computed-hash">
            <p className="muted">Hash van {file.name} (keccak256)</p>
            <HashValue value={fileHash} full />
          </div>
        )}

        {!file && (
          <details>
            <summary className="muted">Of voer zelf een hash in</summary>
            <label className="field">
              <span>Documenthash</span>
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
            Dit document is al vastgelegd als claim #{existing.index} ({CLAIM_TYPE_LABEL[existing.claimType].toLowerCase()}) bij deze
            batch. Je kunt het opnieuw vastleggen, maar claims kunnen niet worden gewijzigd of verwijderd.
          </p>
        )}
      </fieldset>

      {steps.length > 0 && <Steps steps={steps} />}
      {failure && <ErrorBox error={failure} />}

      <div className="buttons">
        <SubmitButton pending={pending} disabled={!permission.allowed || noHash || !!hashProblem || hashing}>
          Claim toevoegen
        </SubmitButton>
        <a className="button" href={href.batch(id)}>
          Annuleren
        </a>
      </div>
      {permission.allowed && noHash && !hashing && (
        <p className="help">Kies een document om de claim te kunnen toevoegen.</p>
      )}
      {/* Keep the rules close at hand for anyone who wonders why a type is refused. */}
      <details className="help">
        <summary>Wie kan welke claim toevoegen?</summary>
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

