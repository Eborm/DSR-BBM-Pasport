import { useState, type FormEvent } from "react";
import { QrCode } from "../components/QrCode";
import { ErrorBox, HashValue, Skeleton, Steps, SubmitButton, type Step } from "../components/ui";
import { canRegister, CLASSIFICATION_LABEL, LEVELS, SOURCE_FILE_LABEL } from "../lib/domain";
import { Classification, Level, SourceFile } from "../lib/domain";
import { explainError, type Explained } from "../lib/errors";
import { secondsFromDateInput } from "../lib/format";
import { hashFile } from "../lib/hash";
import { href } from "../lib/router";
import { usePassport } from "../state";

type Field = "producer" | "materialType" | "mass" | "origin" | "productionDate" | "document";

const EMPTY = {
  producer: "",
  classification: String(Classification.A1),
  materialType: "",
  level: String(Level.RawMaterial),
  mass: "",
  origin: "",
  productionDate: "",
  sourceFile: String(SourceFile.Bim),
};

/** Screen C: register a batch. */
export function Register() {
  const { role, writer, reload, snapshot, contract, claims } = usePassport();
  const permission = canRegister(role);
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [steps, setSteps] = useState<Step[]>([]);
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<Explained | null>(null);
  const [registered, setRegistered] = useState<bigint | null>(null);
  // The source document is hashed in the browser; only its hash goes on the chain (as the Registration claim).
  const [file, setFile] = useState<File | null>(null);
  const [fileHash, setFileHash] = useState<string | null>(null);
  const [hashing, setHashing] = useState(false);
  const [hashError, setHashError] = useState<string | null>(null);

  const set = (field: keyof typeof EMPTY) => (value: string) => setForm((f) => ({ ...f, [field]: value }));

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

  function validate() {
    const found: Partial<Record<Field, string>> = {};
    if (!form.producer.trim()) found.producer = "Voer een producent in.";
    if (!form.materialType.trim()) found.materialType = "Voer een materiaalsoort in.";
    if (!/^\d+$/.test(form.mass) || BigInt(form.mass) === 0n) found.mass = "Voer een gehele massa groter dan nul in.";
    if (!form.origin.trim()) found.origin = "Voer een herkomst in.";
    if (!form.productionDate) found.productionDate = "Kies een productiedatum.";
    if (!fileHash) found.document = hashing ? "Wait until the file has been hashed." : "Choose the source document.";
    setErrors(found);
    return Object.keys(found).length === 0;
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setFailure(null);
    if (!validate() || !fileHash) return;

    const plan: Step[] = [{ title: "Transactie verzenden", state: "waiting" }];
    const update = (index: number, step: Partial<Step>) =>
      setSteps((current) => current.map((s, i) => (i === index ? { ...s, ...step } : s)));
    setSteps(plan);
    setPending(true);

    try {
      update(0, { state: "busy" });
      const passport = await writer();
      const tx = await passport.registerBatch(
        form.producer.trim(),
        Number(form.classification),
        form.materialType.trim(),
        Number(form.level),
        BigInt(form.mass),
        form.origin.trim(),
        BigInt(secondsFromDateInput(form.productionDate)),
        Number(form.sourceFile),
        fileHash,
      );
      const receipt = await tx.wait();
      const event = receipt?.logs
        .map((log: any) => {
          try {
            return contract.interface.parseLog(log);
          } catch {
            return null;
          }
        })
        .find((parsed: any) => parsed?.name === "BatchRegistered");
      update(0, { state: "done", detail: <p className="muted">Transactie {tx.hash.slice(0, 10)}… bevestigd</p> });
      await reload();
      setRegistered(event ? (event.args.batchId as bigint) : await contract.batchCount());
    } catch (error) {
      update(0, { state: "failed" });
      setFailure(explainError(error, claims?.interface));
    } finally {
      setPending(false);
    }
  }

  if (registered !== null) {
    const batch = snapshot?.batches.get(registered);
    return (
      <div className="result">
        <h1>Batch #{registered.toString()} geregistreerd</h1>
        <div className="result-content">
          {batch ? <QrCode batch={batch} /> : <Skeleton width="160px" height="160px" />}
          <div>
            <p className="instruction">
              <strong>Bevestig deze QR-code aan het materiaal.</strong> Zonder fysieke markering kan de digitale registratie
              later niet worden teruggevonden. Druk het label af of download het en bevestig het zichtbaar aan de batch.
            </p>
            <div className="buttons">
              <a className="button primary" href={href.batch(registered)}>
                Ga naar batch #{registered.toString()}
              </a>
              <button
                type="button"
                className="button"
                onClick={() => {
                  setRegistered(null);
                  setForm(EMPTY);
                  setFile(null);
                  setFileHash(null);
                  setSteps([]);
                }}
              >
                Nog een batch registreren
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const errorId = (field: Field) => (errors[field] ? `error-${field}` : undefined);

  return (
    <form className="form" onSubmit={submit} noValidate>
      <h1>Batch registreren</h1>
      {!permission.allowed && (
        <p className="reason block" role="note">
          {permission.reason}
        </p>
      )}
      <fieldset disabled={!permission.allowed || pending}>
        <label className="field">
          <span>Producent *</span>
          <input
            value={form.producer}
            onChange={(e) => set("producer")(e.target.value)}
            aria-invalid={!!errors.producer}
            aria-describedby={errorId("producer")}
          />
          {errors.producer && <span className="field-error" id="error-producer">{errors.producer}</span>}
        </label>

        <label className="field">
          <span>Materiaalsoort *</span>
          <input
            value={form.materialType}
            onChange={(e) => set("materialType")(e.target.value)}
            placeholder="bijv. Staal S355, Beton C30/37"
            aria-invalid={!!errors.materialType}
            aria-describedby={errorId("materialType")}
          />
          {errors.materialType && <span className="field-error" id="error-materialType">{errors.materialType}</span>}
        </label>

        <div className="row">
          <label className="field">
            <span>Classificatie *</span>
            <select value={form.classification} onChange={(e) => set("classification")(e.target.value)}>
              {Object.entries(CLASSIFICATION_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Massa (kg) *</span>
            <input
              inputMode="numeric"
              value={form.mass}
              onChange={(e) => set("mass")(e.target.value.replace(/[^0-9]/g, ""))}
              aria-invalid={!!errors.mass}
              aria-describedby={errorId("mass")}
            />
            {errors.mass && <span className="field-error" id="error-mass">{errors.mass}</span>}
          </label>
        </div>

        <fieldset className="choices">
          <legend>Niveau *</legend>
          {LEVELS.map((label, index) => (
            <label key={label} className="choice">
              <input
                type="radio"
                name="level"
                value={index}
                checked={form.level === String(index)}
                onChange={(e) => set("level")(e.target.value)}
              />
              {label}
            </label>
          ))}
        </fieldset>

        <div className="row">
          <label className="field">
            <span>Herkomst *</span>
            <input
              value={form.origin}
              onChange={(e) => set("origin")(e.target.value)}
              placeholder="Producent of donorgebouw"
              aria-invalid={!!errors.origin}
              aria-describedby={errorId("origin")}
            />
            {errors.origin && <span className="field-error" id="error-origin">{errors.origin}</span>}
          </label>
          <label className="field">
            <span>Productiedatum *</span>
            <input
              type="date"
              value={form.productionDate}
              onChange={(e) => set("productionDate")(e.target.value)}
              aria-invalid={!!errors.productionDate}
              aria-describedby={errorId("productionDate")}
            />
            {errors.productionDate && <span className="field-error" id="error-productionDate">{errors.productionDate}</span>}
          </label>
        </div>

        <label className="field">
          <span>Bron *</span>
          <select value={form.sourceFile} onChange={(e) => set("sourceFile")(e.target.value)}>
            {Object.entries(SOURCE_FILE_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span>Source document *</span>
          <input
            type="file"
            onChange={(e) => void chooseFile(e.target.files?.[0] ?? null)}
            aria-invalid={!!errors.document}
            aria-describedby={errorId("document")}
          />
          <span className="help">
            The file is hashed in your browser and never leaves your device. Only the hash is stored on the chain, as the
            registration claim of this batch.
          </span>
          {errors.document && <span className="field-error" id="error-document">{errors.document}</span>}
        </label>

        {hashing && <p className="muted">Calculating hash…</p>}
        {hashError && <p className="field-error">{hashError}</p>}
        {fileHash && file && (
          <div className="computed-hash">
            <p className="muted">Hash of {file.name} (keccak256)</p>
            <HashValue value={fileHash} full />
          </div>
        )}
      </fieldset>

      {steps.length > 0 && <Steps steps={steps} />}
      {failure && <ErrorBox error={failure} />}

      <div className="buttons">
        <SubmitButton pending={pending} disabled={!permission.allowed}>
          Registreren
        </SubmitButton>
        <a className="button" href={href.overview()}>
          Annuleren
        </a>
      </div>
    </form>
  );
}