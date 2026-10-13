import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Address, ErrorBox, HashValue, Steps, SubmitButton, type Step } from "../components/ui";
import {
  CLAIM_TYPE_LABEL,
  CLAIM_TYPES,
  ClaimType,
  FORM_CLAIM_TYPES,
  ROLE_LABEL,
  TRANSFER_RECIPIENT_ROLES,
  allowedRolesLabel,
  canAddClaim,
  canTransferBatch,
  claimTypesFor,
} from "../lib/domain";
import { explainError, type Explained } from "../lib/errors";
import { hashFile, isHash, ZERO_HASH } from "../lib/hash";
import { href } from "../lib/router";
import { usePassport } from "../state";

/** Screen D: add a claim to a batch. The document itself stays in the browser; only its hash goes on the chain. */
export function AddClaim({ id }: { id: bigint }) {
  const { snapshot, contract, role, writer, reload, account, deployment, roleOf } = usePassport();
  const [type, setType] = useState<ClaimType>(ClaimType.StatusChange);
  const [file, setFile] = useState<File | null>(null);
  const [fileHash, setFileHash] = useState<string | null>(null);
  const [manualHash, setManualHash] = useState("");
  const [hashing, setHashing] = useState(false);
  const [hashError, setHashError] = useState<string | null>(null);
  const [steps, setSteps] = useState<Step[]>([]);
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<Explained | null>(null);
  const [added, setAdded] = useState<{ index: number; hash: string; tx: string; newOwner?: string } | null>(null);
  const [newOwner, setNewOwner] = useState("");

  const batch = snapshot?.batches.get(id);
  const isTransfer = type === ClaimType.OwnershipTransfer;
  const ownsBatch = !!account && !!batch && account.address.toLowerCase() === batch.currentOwner.toLowerCase();

  // Start on a claim type the chosen account may actually add. A batch owner who can add no other claim
  // (a manufacturer, say) starts on the ownership transfer.
  const allowedTypes = claimTypesFor(role);
  useEffect(() => {
    if (allowedTypes.length > 0 && !allowedTypes.includes(type)) setType(allowedTypes[0]);
    else if (allowedTypes.length === 0 && ownsBatch) setType(ClaimType.OwnershipTransfer);
    // Only when the account (and so the role) changes, not on every choice of type.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role, ownsBatch]);

  // Accounts that may receive the batch: an Owner or Demolisher, and not the account that sends it.
  const recipients = deployment.accounts.filter((a) => {
    const accountRole = roleOf(a.address);
    return (
      accountRole !== undefined &&
      TRANSFER_RECIPIENT_ROLES.includes(accountRole) &&
      a.address.toLowerCase() !== account?.address.toLowerCase()
    );
  });
  useEffect(() => {
    if (!recipients.some((a) => a.address === newOwner)) setNewOwner(recipients[0]?.address ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recipients.map((a) => a.address).join(","), account?.address]);

  // A chosen file wins over a typed hash.
  const hash = fileHash ?? (manualHash.trim() ? manualHash.trim().toLowerCase() : null);
  const hashProblem = useMemo(() => {
    if (hash === null) return null;
    if (!isHash(hash)) return "Een hash bestaat uit 0x gevolgd door 64 hexadecimale tekens.";
    if (hash === ZERO_HASH) return "Een hash met alleen nullen is niet toegestaan.";
    return null;
  }, [hash]);

  const permission = isTransfer ? canTransferBatch(account?.address, batch) : canAddClaim(role, type);
  const transferNeedsRecipient = isTransfer && permission.allowed && !newOwner;
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
    if (!hash || hashProblem || !permission.allowed || (isTransfer && !newOwner)) return;

    const update = (index: number, step: Partial<Step>) =>
      setSteps((current) => current.map((s, i) => (i === index ? { ...s, ...step } : s)));
    setSteps([{ title: "Transactie verzenden", state: "busy" }]);
    setPending(true);

    try {
      const registry = await writer();
      // An ownership transfer is a claim too, but the contract writes it itself (system claim): it moves the
      // batch to the new owner and records the claim in one transaction.
      const tx = isTransfer ? await registry.transferOwnership(id, newOwner, hash) : await registry.addClaim(id, type, hash);
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
        newOwner: isTransfer ? newOwner : undefined,
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
            {added.newOwner && (
              <p>
                Ownership of batch #{id.toString()} was transferred to <Address value={added.newOwner} withRole />.
              </p>
            )}
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
                  setNewOwner(recipients[0]?.address ?? "");
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
            {FORM_CLAIM_TYPES.map((t) => (
              <option key={t} value={t}>
                {CLAIM_TYPE_LABEL[t]}
              </option>
            ))}
          </select>
          <span className="help">
            {isTransfer
              ? "Can be done by: the current owner of this batch. The batch moves to the new owner you choose."
              : `Can be added by: ${allowedRolesLabel(type)}.`}
          </span>
        </label>

        {isTransfer && (
          <label className="field">
            <span>New owner *</span>
            <select value={newOwner} onChange={(e) => setNewOwner(e.target.value)} disabled={recipients.length === 0}>
              {recipients.length === 0 && <option value="">No account available</option>}
              {recipients.map((a) => {
                const accountRole = roleOf(a.address);
                return (
                  <option key={a.address} value={a.address}>
                    {a.name}
                    {accountRole !== undefined ? ` (${ROLE_LABEL[accountRole]})` : ""}
                  </option>
                );
              })}
            </select>
            <span className="help">
              Only an account with the role Owner or Demolisher can receive a batch.
              {batch && (
                <>
                  {" "}Current owner: <Address value={batch.currentOwner} withRole />.
                </>
              )}
            </span>
          </label>
        )}

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
            <p className="muted">Hash of {file.name} (keccak256)</p>
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
            This document is already recorded as claim #{existing.index} ({CLAIM_TYPE_LABEL[existing.claimType].toLowerCase()}) on this
            batch. You can record it again, but claims cannot be changed or removed.
          </p>
        )}
      </fieldset>

      {steps.length > 0 && <Steps steps={steps} />}
      {failure && <ErrorBox error={failure} />}

      <div className="buttons">
        <SubmitButton pending={pending} disabled={!permission.allowed || noHash || !!hashProblem || hashing || transferNeedsRecipient}>
          {isTransfer ? "Transfer ownership" : "Claim toevoegen"}
        </SubmitButton>
        <a className="button" href={href.batch(id)}>
          Cancel
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
          <li>{CLAIM_TYPE_LABEL[ClaimType.OwnershipTransfer]}: the current owner of the batch</li>
        </ul>
      </details>
    </form>
  );
}

