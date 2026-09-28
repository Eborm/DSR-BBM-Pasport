import { useState, type FormEvent } from "react";
import { ErrorBox, HashValue, Skeleton, Steps, SubmitButton, type Step } from "../components/ui";
import { hashBytes, readBytes, uploadDocument } from "../lib/documents";
import { canClaim, canClaimAny, CLAIMABLE_KINDS, KIND_ID, KIND_LABEL, type Kind } from "../lib/domain";
import { explainError, type Explained } from "../lib/errors";
import { href } from "../lib/router";
import { usePassport } from "../state";

const INITIAL_STEPS: Step[] = [
  { title: "Bestand uploaden naar de documentopslag", state: "wachten" },
  { title: "Hash berekenen over de bytes van het bestand", state: "wachten" },
  { title: "Transactie versturen met URI en hash", state: "wachten" },
];

/** Scherm D: claim met bewijs toevoegen. */
export function AddClaim({ id }: { id: bigint }) {
  const { snapshot, roles, account, deployment, writer, reload } = usePassport();
  const batch = snapshot?.batches.get(id);
  const isOwner = !!batch && account?.address.toLowerCase() === batch.owner.toLowerCase();

  const allowedKinds = CLAIMABLE_KINDS.filter((k) => canClaim(k, roles, isOwner).allowed);
  const [kind, setKind] = useState<Kind | "">("");
  const selected: Kind | "" = kind || allowedKinds[0] || "";
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [steps, setSteps] = useState<Step[]>(INITIAL_STEPS);
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<Explained | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (!snapshot) return <Skeleton height="20rem" />;
  if (!batch) {
    return (
      <div className="leeg">
        <h1>Batch #{id.toString()} bestaat niet</h1>
        <a className="knop" href={href.overzicht()}>
          Naar het overzicht
        </a>
      </div>
    );
  }

  const permission = canClaimAny(roles, isOwner);
  const update = (index: number, step: Partial<Step>) =>
    setSteps((current) => current.map((s, i) => (i === index ? { ...s, ...step } : s)));

  async function submit(event: FormEvent) {
    event.preventDefault();
    setFailure(null);
    if (!selected) return setProblem("Kies een soort gebeurtenis.");
    if (!description.trim()) return setProblem("Vul een korte omschrijving in.");
    if (!file) return setProblem("Voeg een bestand toe als bewijs.");
    setProblem(null);
    setSteps(INITIAL_STEPS);
    setPending(true);
    let current = 0;
    try {
      const bytes = await readBytes(file);
      update(0, { state: "bezig" });
      const uri = await uploadDocument(deployment.storageUrl, file, bytes);
      update(0, { state: "klaar", detail: <p className="stil breek">URI: {uri}</p> });

      current = 1;
      update(1, { state: "bezig" });
      const hash = hashBytes(bytes);
      update(1, {
        state: "klaar",
        detail: (
          <div className="berekende-hash">
            <p className="stil">keccak256 over {bytes.length.toLocaleString("nl-NL")} bytes:</p>
            <HashValue value={hash} full />
          </div>
        ),
      });

      current = 2;
      update(2, { state: "bezig" });
      const passport = await writer();
      const tx = await passport.addClaim(id, KIND_ID[selected as Kind], hash, uri, description.trim());
      await tx.wait();
      update(2, { state: "klaar", detail: <p className="stil">Transactie {tx.hash.slice(0, 10)}… bevestigd</p> });
      await reload();
      setDone(true);
    } catch (error) {
      update(current, { state: "fout" });
      setFailure(explainError(error));
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="formulier" onSubmit={submit} noValidate>
      <p className="bovenschrift">
        <a href={href.batch(id)}>← Batch #{id.toString()}</a> · {batch.materialType}
      </p>
      <h1>Claim toevoegen</h1>
      {!permission.allowed && (
        <p className="reden blok" role="note">
          {permission.reason}
        </p>
      )}

      <fieldset disabled={!permission.allowed || pending || done}>
        <fieldset className="keuzes">
          <legend>Soort gebeurtenis *</legend>
          {CLAIMABLE_KINDS.map((k) => {
            const allowed = canClaim(k, roles, isOwner);
            return (
              <label key={k} className={allowed.allowed ? "keuze" : "keuze uit"}>
                <input
                  type="radio"
                  name="kind"
                  value={k}
                  checked={selected === k}
                  disabled={!allowed.allowed}
                  onChange={() => setKind(k)}
                />
                {KIND_LABEL[k]}
                {!allowed.allowed && <span className="reden inline"> {allowed.reason}</span>}
              </label>
            );
          })}
        </fieldset>

        <label className="veld">
          <span>Omschrijving *</span>
          <textarea
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Korte omschrijving voor de tijdlijn, bijv. 'Herkeuring: restcapaciteit 85%'"
          />
        </label>

        <label className="veld">
          <span>Bewijsstuk *</span>
          <input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          <span className="hulp">Keuringsrapport, foto, bouwtekening of ander document.</span>
        </label>
      </fieldset>

      <h2 className="klein-kop">Zo wordt de claim vastgelegd</h2>
      <Steps steps={steps} />

      {problem && (
        <p className="veldfout" role="alert">
          {problem}
        </p>
      )}
      {failure && <ErrorBox error={failure} />}

      {done ? (
        <div className="knoppen">
          <p role="status">
            <strong>Claim toegevoegd aan de tijdlijn.</strong>
          </p>
          <a className="knop primair" href={href.batch(id)}>
            Terug naar batch #{id.toString()}
          </a>
        </div>
      ) : (
        <div className="knoppen">
          <SubmitButton pending={pending} disabled={!permission.allowed} pendingLabel="Bezig…">
            Claim vastleggen
          </SubmitButton>
          <a className="knop" href={href.batch(id)}>
            Annuleren
          </a>
        </div>
      )}
    </form>
  );
}
