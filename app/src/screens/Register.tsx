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
    if (!form.producer.trim()) found.producer = "Vul een producent in.";
    if (!form.materialType.trim()) found.materialType = "Vul een materiaalsoort in.";
    if (!/^\d+$/.test(form.mass) || BigInt(form.mass) === 0n) found.mass = "Vul een hele massa groter dan nul in.";
    if (!form.origin.trim()) found.origin = "Vul een herkomst in.";
    if (!form.productionDate) found.productionDate = "Kies een productiedatum.";
    setErrors(found);
    return Object.keys(found).length === 0;
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setFailure(null);
    if (!validate()) return;

    const plan: Step[] = [{ title: "Transactie versturen", state: "wachten" }];
    const update = (index: number, step: Partial<Step>) =>
      setSteps((current) => current.map((s, i) => (i === index ? { ...s, ...step } : s)));
    setSteps(plan);
    setPending(true);

    try {
      update(0, { state: "bezig" });
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
      update(0, { state: "klaar", detail: <p className="stil">Transactie {tx.hash.slice(0, 10)}… bevestigd</p> });
      await reload();
      setRegistered(event ? (event.args.batchId as bigint) : await contract.batchCount());
    } catch (error) {
      update(0, { state: "fout" });
      setFailure(explainError(error));
    } finally {
      setPending(false);
    }
  }

  if (registered !== null) {
    const batch = snapshot?.batches.get(registered);
    return (
      <div className="resultaat">
        <h1>Batch #{registered.toString()} geregistreerd</h1>
        <div className="resultaat-inhoud">
          {batch ? <QrCode batch={batch} /> : <Skeleton width="160px" height="160px" />}
          <div>
            <p className="instructie">
              <strong>Breng deze QR-code aan op het materiaal.</strong> Zonder fysieke markering is de digitale registratie
              later niet terug te vinden. Druk het label af of download het, en bevestig het zichtbaar op de batch.
            </p>
            <div className="knoppen">
              <a className="knop primair" href={href.batch(registered)}>
                Naar batch #{registered.toString()}
              </a>
              <button
                type="button"
                className="knop"
                onClick={() => {
                  setRegistered(null);
                  setForm(EMPTY);
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

  const errorId = (field: Field) => (errors[field] ? `fout-${field}` : undefined);

  return (
    <form className="formulier" onSubmit={submit} noValidate>
      <h1>Batch registreren</h1>
      {!permission.allowed && (
        <p className="reden blok" role="note">
          {permission.reason}
        </p>
      )}
      <fieldset disabled={!permission.allowed || pending}>
        <label className="veld">
          <span>Producent *</span>
          <input
            value={form.producer}
            onChange={(e) => set("producer")(e.target.value)}
            aria-invalid={!!errors.producer}
            aria-describedby={errorId("producer")}
          />
          {errors.producer && <span className="veldfout" id="fout-producer">{errors.producer}</span>}
        </label>

        <label className="veld">
          <span>Materiaalsoort *</span>
          <input
            value={form.materialType}
            onChange={(e) => set("materialType")(e.target.value)}
            placeholder="bijv. Staal S355, Beton C30/37"
            aria-invalid={!!errors.materialType}
            aria-describedby={errorId("materialType")}
          />
          {errors.materialType && <span className="veldfout" id="fout-materialType">{errors.materialType}</span>}
        </label>

        <div className="rij">
          <label className="veld">
            <span>Classificatie *</span>
            <select value={form.classification} onChange={(e) => set("classification")(e.target.value)}>
              {Object.entries(CLASSIFICATION_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="veld">
            <span>Massa (kg) *</span>
            <input
              inputMode="numeric"
              value={form.mass}
              onChange={(e) => set("mass")(e.target.value.replace(/[^0-9]/g, ""))}
              aria-invalid={!!errors.mass}
              aria-describedby={errorId("mass")}
            />
            {errors.mass && <span className="veldfout" id="fout-mass">{errors.mass}</span>}
          </label>
        </div>

        <fieldset className="keuzes">
          <legend>Niveau *</legend>
          {LEVELS.map((label, index) => (
            <label key={label} className="keuze">
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

        <div className="rij">
          <label className="veld">
            <span>Herkomst *</span>
            <input
              value={form.origin}
              onChange={(e) => set("origin")(e.target.value)}
              placeholder="Producent of donorgebouw"
              aria-invalid={!!errors.origin}
              aria-describedby={errorId("origin")}
            />
            {errors.origin && <span className="veldfout" id="fout-origin">{errors.origin}</span>}
          </label>
          <label className="veld">
            <span>Productiedatum *</span>
            <input
              type="date"
              value={form.productionDate}
              onChange={(e) => set("productionDate")(e.target.value)}
              aria-invalid={!!errors.productionDate}
              aria-describedby={errorId("productionDate")}
            />
            {errors.productionDate && <span className="veldfout" id="fout-productionDate">{errors.productionDate}</span>}
          </label>
        </div>

        <label className="veld">
          <span>Bron *</span>
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

      <div className="knoppen">
        <SubmitButton pending={pending} disabled={!permission.allowed}>
          Registreren
        </SubmitButton>
        <a className="knop" href={href.overzicht()}>
          Annuleren
        </a>
      </div>
    </form>
  );
}
