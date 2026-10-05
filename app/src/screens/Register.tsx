import { useState, type FormEvent } from "react";
import { QrCode } from "../components/QrCode";
import { ErrorBox, Skeleton, Steps, SubmitButton, type Step } from "../components/ui";
import { canRegister, CLASSIFICATION_LABEL, LEVELS, SOURCE_FILE_LABEL } from "../lib/domain";
import { Classification, Level, SourceFile } from "../lib/domain";
import { explainError, type Explained } from "../lib/errors";
import { secondsFromDateInput } from "../lib/format";
import { href } from "../lib/router";
import { usePassport } from "../state";

type Field = "producer" | "materialType" | "mass" | "origin" | "productionDate";

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
  const { role, writer, reload, snapshot, contract } = usePassport();
  const permission = canRegister(role);
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [steps, setSteps] = useState<Step[]>([]);
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<Explained | null>(null);
  const [registered, setRegistered] = useState<bigint | null>(null);

  const set = (field: keyof typeof EMPTY) => (value: string) => setForm((f) => ({ ...f, [field]: value }));

  function validate() {
    const found: Partial<Record<Field, string>> = {};
    if (!form.producer.trim()) found.producer = "Enter a producer.";
    if (!form.materialType.trim()) found.materialType = "Enter a material type.";
    if (!/^\d+$/.test(form.mass) || BigInt(form.mass) === 0n) found.mass = "Enter a whole mass greater than zero.";
    if (!form.origin.trim()) found.origin = "Enter an origin.";
    if (!form.productionDate) found.productionDate = "Choose a production date.";
    setErrors(found);
    return Object.keys(found).length === 0;
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setFailure(null);
    if (!validate()) return;

    const plan: Step[] = [{ title: "Send transaction", state: "waiting" }];
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
      update(0, { state: "done", detail: <p className="muted">Transaction {tx.hash.slice(0, 10)}… confirmed</p> });
      await reload();
      setRegistered(event ? (event.args.batchId as bigint) : await contract.batchCount());
    } catch (error) {
      update(0, { state: "failed" });
      setFailure(explainError(error));
    } finally {
      setPending(false);
    }
  }

  if (registered !== null) {
    const batch = snapshot?.batches.get(registered);
    return (
      <div className="result">
        <h1>Batch #{registered.toString()} registered</h1>
        <div className="result-content">
          {batch ? <QrCode batch={batch} /> : <Skeleton width="160px" height="160px" />}
          <div>
            <p className="instruction">
              <strong>Attach this QR code to the material.</strong> Without a physical marking, the digital registration
              cannot be found again later. Print the label or download it, and attach it visibly to the batch.
            </p>
            <div className="buttons">
              <a className="button primary" href={href.batch(registered)}>
                Go to batch #{registered.toString()}
              </a>
              <button
                type="button"
                className="button"
                onClick={() => {
                  setRegistered(null);
                  setForm(EMPTY);
                  setSteps([]);
                }}
              >
                Register another batch
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
      <h1>Register batch</h1>
      {!permission.allowed && (
        <p className="reason block" role="note">
          {permission.reason}
        </p>
      )}
      <fieldset disabled={!permission.allowed || pending}>
        <label className="field">
          <span>Producer *</span>
          <input
            value={form.producer}
            onChange={(e) => set("producer")(e.target.value)}
            aria-invalid={!!errors.producer}
            aria-describedby={errorId("producer")}
          />
          {errors.producer && <span className="field-error" id="error-producer">{errors.producer}</span>}
        </label>

        <label className="field">
          <span>Material type *</span>
          <input
            value={form.materialType}
            onChange={(e) => set("materialType")(e.target.value)}
            placeholder="e.g. Steel S355, Concrete C30/37"
            aria-invalid={!!errors.materialType}
            aria-describedby={errorId("materialType")}
          />
          {errors.materialType && <span className="field-error" id="error-materialType">{errors.materialType}</span>}
        </label>

        <div className="row">
          <label className="field">
            <span>Classification *</span>
            <select value={form.classification} onChange={(e) => set("classification")(e.target.value)}>
              {Object.entries(CLASSIFICATION_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Mass (kg) *</span>
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
          <legend>Level *</legend>
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
            <span>Origin *</span>
            <input
              value={form.origin}
              onChange={(e) => set("origin")(e.target.value)}
              placeholder="Producer or donor building"
              aria-invalid={!!errors.origin}
              aria-describedby={errorId("origin")}
            />
            {errors.origin && <span className="field-error" id="error-origin">{errors.origin}</span>}
          </label>
          <label className="field">
            <span>Production date *</span>
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
          <span>Source *</span>
          <select value={form.sourceFile} onChange={(e) => set("sourceFile")(e.target.value)}>
            {Object.entries(SOURCE_FILE_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </fieldset>

      {steps.length > 0 && <Steps steps={steps} />}
      {failure && <ErrorBox error={failure} />}

      <div className="buttons">
        <SubmitButton pending={pending} disabled={!permission.allowed}>
          Register
        </SubmitButton>
        <a className="button" href={href.overview()}>
          Cancel
        </a>
      </div>
    </form>
  );
}
