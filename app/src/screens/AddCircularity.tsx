import { useState, type FormEvent } from "react";
import { ErrorBox, HashValue, Steps, SubmitButton, type Step } from "../components/ui";
import { storeDocument } from "../lib/api";
import {
  DECLARATION_SCHEMA,
  MAX_APPLICATION_LENGTH,
  MAX_NEXT_APPLICATIONS,
  REPAIR_LABEL,
  REPAIR_LEVELS,
  declarationBytes,
  validateDeclaration,
  type CircularityDeclaration,
  type RepairLevel,
} from "../lib/circularity";
import { ClaimType, canAddCircularity } from "../lib/domain";
import { explainError, type Explained } from "../lib/errors";
import { hashFile } from "../lib/hash";
import { href } from "../lib/router";
import { usePassport } from "../state";

type Field =
  | "reusablePercent"
  | "recyclablePercent"
  | "recycledContentPercent"
  | "residualValueEur"
  | "gwp"
  | "nextApplications";

const EMPTY = {
  reusablePercent: "",
  recyclablePercent: "",
  recycledContentPercent: "",
  repairability: "good" as RepairLevel,
  residualValueEur: "",
  gwp: "",
  nextApplications: "",
};

/** A typed number, or NaN if the field is empty or not a number. */
const toNumber = (text: string) => (text.trim() === "" ? NaN : Number(text.trim().replace(",", ".")));

/** Add a circularity and environmental declaration: the data goes off-chain, its hash goes on the chain. */
export function AddCircularity({ id }: { id: bigint }) {
  const { snapshot, contract, role, writer, reload } = usePassport();
  const permission = canAddCircularity(role);
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [epdFile, setEpdFile] = useState<File | null>(null);
  const [epdHash, setEpdHash] = useState<string | null>(null);
  const [steps, setSteps] = useState<Step[]>([]);
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<Explained | null>(null);
  const [added, setAdded] = useState<{ index: number; hash: string } | null>(null);

  const set = (field: keyof typeof EMPTY) => (value: string) => setForm((f) => ({ ...f, [field]: value }));
  const batch = snapshot?.batches.get(id);

  async function chooseEpd(next: File | null) {
    setEpdFile(next);
    setEpdHash(null);
    if (next) setEpdHash(await hashFile(next));
  }

  /** Builds the declaration from the form, or reports what is wrong with each field. */
  function build(): CircularityDeclaration | null {
    const found: Partial<Record<Field, string>> = {};
    const percent = (field: "reusablePercent" | "recyclablePercent" | "recycledContentPercent") => {
      const value = toNumber(form[field]);
      if (!(value >= 0 && value <= 100)) found[field] = "Voer een getal van 0 tot 100 in.";
      return value;
    };
    const reusablePercent = percent("reusablePercent");
    const recyclablePercent = percent("recyclablePercent");
    const recycledContentPercent = percent("recycledContentPercent");

    const residualValueEur = toNumber(form.residualValueEur);
    if (!(residualValueEur >= 0)) found.residualValueEur = "Voer een bedrag van 0 of meer in.";
    const gwp = toNumber(form.gwp);
    if (!(gwp >= 0)) found.gwp = "Voer een getal van 0 of meer in.";

    const nextApplications = form.nextApplications
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    if (nextApplications.length < 1) found.nextApplications = "Voer minstens één mogelijke vervolgtoepassing in.";
    else if (nextApplications.length > MAX_NEXT_APPLICATIONS) found.nextApplications = `Voer maximaal ${MAX_NEXT_APPLICATIONS} toepassingen in.`;
    else if (nextApplications.some((line) => line.length > MAX_APPLICATION_LENGTH)) {
      found.nextApplications = `Houd elke toepassing onder de ${MAX_APPLICATION_LENGTH} tekens.`;
    }

    setErrors(found);
    if (Object.keys(found).length > 0) return null;

    const declaration: CircularityDeclaration = {
      schema: DECLARATION_SCHEMA,
      batchId: id.toString(),
      reusablePercent,
      recyclablePercent,
      repairability: form.repairability,
      recycledContentPercent,
      residualValueEur,
      nextApplications,
      environment: { gwpA1A3KgCo2ePerKg: gwp, ...(epdHash ? { epdHash } : {}) },
    };
    // The same rules the API and every other reader apply; this should never fail after the checks above.
    return validateDeclaration(declaration).length === 0 ? declaration : null;
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setFailure(null);
    const declaration = build();
    if (!declaration || !permission.allowed) return;

    const update = (index: number, step: Partial<Step>) =>
      setSteps((current) => current.map((s, i) => (i === index ? { ...s, ...step } : s)));
    setSteps([
      { title: "Verklaring opslaan buiten de Chain", state: "busy" },
      { title: "Hash vastleggen op de Chain", state: "waiting" },
    ]);
    setPending(true);

    let step = 0;
    try {
      // 1. The document goes to the store first, so a claim never points at a document that is not there.
      const bytes = declarationBytes(declaration);
      const hash = await storeDocument(bytes);
      update(0, { state: "done" });

      // 2. Only the hash goes on the chain.
      step = 1;
      update(1, { state: "busy" });
      const registry = await writer();
      const tx = await registry.addClaim(id, ClaimType.CircularityInfo, hash);
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
      update(1, { state: "done", detail: <p className="muted">Transactie {tx.hash.slice(0, 10)}… bevestigd</p> });
      await reload();
      setAdded({ index: claimEvent ? Number(claimEvent.args.claimIndex) : (snapshot?.claims.get(id)?.length ?? 0), hash });
    } catch (error) {
      update(step, { state: "failed" });
      setFailure(step === 0 ? { message: error instanceof Error ? error.message : "De verklaring kon niet worden opgeslagen." } : explainError(error, contract.interface));
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
        <h1>Circulariteitsverklaring toegevoegd aan batch #{id.toString()}</h1>
        <p className="instruction">
          De verklaring is buiten de Chain opgeslagen. De hash staat nu op de Chain als claim #{added.index}, zodat iedereen kan
          controleren dat de opgeslagen verklaring niet is gewijzigd.
        </p>
        <p>
          <span className="muted">Documenthash</span> <HashValue value={added.hash} />
        </p>
        <div className="buttons">
          <a className="button primary" href={href.batch(id)}>
            Ga naar batch #{id.toString()}
          </a>
        </div>
      </div>
    );
  }

  const errorId = (field: Field) => (errors[field] ? `error-${field}` : undefined);
  const message = (field: Field) =>
    errors[field] && (
      <span className="field-error" id={`error-${field}`}>
        {errors[field]}
      </span>
    );

  return (
    <form className="form" onSubmit={submit} noValidate>
      <h1>Circulariteitsverklaring voor batch #{id.toString()}</h1>
      <p className="muted">
        {batch.materialType} · {batch.producer}
      </p>
      {!permission.allowed && (
        <p className="reason block" role="note">
          {permission.reason}
        </p>
      )}

      <fieldset disabled={!permission.allowed || pending}>
        <div className="row">
          <label className="field">
            <span>Herbruikbaar zoals het is (%) *</span>
            <input
              inputMode="decimal"
              value={form.reusablePercent}
              onChange={(e) => set("reusablePercent")(e.target.value)}
              aria-invalid={!!errors.reusablePercent}
              aria-describedby={errorId("reusablePercent")}
            />
            {message("reusablePercent")}
          </label>
          <label className="field">
            <span>Recyclebaar (%) *</span>
            <input
              inputMode="decimal"
              value={form.recyclablePercent}
              onChange={(e) => set("recyclablePercent")(e.target.value)}
              aria-invalid={!!errors.recyclablePercent}
              aria-describedby={errorId("recyclablePercent")}
            />
            {message("recyclablePercent")}
          </label>
        </div>

        <div className="row">
          <label className="field">
            <span>Gerecycled aandeel (%) *</span>
            <input
              inputMode="decimal"
              value={form.recycledContentPercent}
              onChange={(e) => set("recycledContentPercent")(e.target.value)}
              aria-invalid={!!errors.recycledContentPercent}
              aria-describedby={errorId("recycledContentPercent")}
            />
            <span className="help">Aandeel secundaire grondstoffen in deze batch.</span>
            {message("recycledContentPercent")}
          </label>
          <label className="field">
            <span>Reparatie *</span>
            <select value={form.repairability} onChange={(e) => set("repairability")(e.target.value)}>
              {REPAIR_LEVELS.map((level) => (
                <option key={level} value={level}>
                  {REPAIR_LABEL[level]}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="row">
          <label className="field">
            <span>Restwaarde van de batch (EUR) *</span>
            <input
              inputMode="decimal"
              value={form.residualValueEur}
              onChange={(e) => set("residualValueEur")(e.target.value)}
              aria-invalid={!!errors.residualValueEur}
              aria-describedby={errorId("residualValueEur")}
            />
            {message("residualValueEur")}
          </label>
          <label className="field">
            <span>CO₂-impact, A1–A3 (kg CO₂-eq per kg) *</span>
            <input
              inputMode="decimal"
              value={form.gwp}
              onChange={(e) => set("gwp")(e.target.value)}
              aria-invalid={!!errors.gwp}
              aria-describedby={errorId("gwp")}
            />
            <span className="help">De GWP-total-waarde uit het EPD (EN 15804+A2).</span>
            {message("gwp")}
          </label>
        </div>

        <label className="field">
          <span>Mogelijke vervolgtoepassingen * (één per regel)</span>
          <textarea
            rows={4}
            value={form.nextApplications}
            onChange={(e) => set("nextApplications")(e.target.value)}
            aria-invalid={!!errors.nextApplications}
            aria-describedby={errorId("nextApplications")}
          />
          {message("nextApplications")}
        </label>

        <label className="field">
          <span>EPD-bestand (optioneel)</span>
          <input type="file" onChange={(e) => void chooseEpd(e.target.files?.[0] ?? null)} />
          <span className="help">
            Het EPD zelf blijft bij jou. Alleen de hash komt in de verklaring, zodat iedereen later kan controleren of een EPD het bedoelde bestand is.
          </span>
        </label>
        {epdHash && epdFile && (
          <div className="computed-hash">
            <p className="muted">Hash van {epdFile.name} (keccak256)</p>
            <HashValue value={epdHash} full />
          </div>
        )}
      </fieldset>

      {steps.length > 0 && <Steps steps={steps} />}
      {failure && <ErrorBox error={failure} title="Niet toegevoegd" />}

      <div className="buttons">
        <SubmitButton pending={pending} disabled={!permission.allowed} pendingLabel="Bezig…">
          Verklaring toevoegen
        </SubmitButton>
        <a className="button" href={href.batch(id)}>
          Annuleren
        </a>
      </div>
    </form>
  );
}
