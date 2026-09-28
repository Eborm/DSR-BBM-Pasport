import { ZeroHash } from "ethers";
import { useState, type FormEvent } from "react";
import { QrCode } from "../components/QrCode";
import { ErrorBox, HashValue, Skeleton, Steps, SubmitButton, type Step } from "../components/ui";
import { hashBytes, readBytes, uploadDocument } from "../lib/documents";
import { canRegister, LEVELS, UNITS } from "../lib/domain";
import { explainError, type Explained } from "../lib/errors";
import { secondsFromDateInput } from "../lib/format";
import { href } from "../lib/router";
import { usePassport } from "../state";

type Field = "materialType" | "quantity" | "unit" | "level";

const EMPTY = { materialType: "", quantity: "", unit: "", level: "", origin: "", productionDate: "" };

/** Scherm C: batch registreren. */
export function Register() {
  const { roles, deployment, writer, reload, snapshot, contract } = usePassport();
  const permission = canRegister(roles);
  const [form, setForm] = useState(EMPTY);
  const [file, setFile] = useState<File | null>(null);
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [steps, setSteps] = useState<Step[]>([]);
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<Explained | null>(null);
  const [registered, setRegistered] = useState<bigint | null>(null);

  const set = (field: keyof typeof EMPTY) => (value: string) => setForm((f) => ({ ...f, [field]: value }));

  function validate() {
    const found: Partial<Record<Field, string>> = {};
    if (!form.materialType.trim()) found.materialType = "Vul een materiaalsoort in.";
    if (!/^\d+$/.test(form.quantity) || BigInt(form.quantity) === 0n) found.quantity = "Vul een hele hoeveelheid groter dan nul in.";
    if (!form.unit) found.unit = "Kies een eenheid.";
    if (form.level === "") found.level = "Kies een niveau.";
    setErrors(found);
    return Object.keys(found).length === 0;
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setFailure(null);
    if (!validate()) return;

    const plan: Step[] = [
      ...(file
        ? [
            { title: "Paspoortdocument opslaan", state: "wachten" as const },
            { title: "Hash berekenen over de bytes", state: "wachten" as const },
          ]
        : []),
      { title: "Transactie versturen", state: "wachten" },
    ];
    const update = (index: number, step: Partial<Step>) =>
      setSteps((current) => current.map((s, i) => (i === index ? { ...s, ...step } : s)));
    setSteps(plan);
    setPending(true);
    let current = 0;

    try {
      let metadataURI = "";
      let metadataHash = ZeroHash;
      if (file) {
        const bytes = await readBytes(file);
        update(0, { state: "bezig" });
        metadataURI = await uploadDocument(deployment.storageUrl, file, bytes);
        update(0, { state: "klaar", detail: <p className="stil breek">{metadataURI}</p> });
        current = 1;
        update(1, { state: "bezig" });
        metadataHash = hashBytes(bytes);
        update(1, { state: "klaar", detail: <HashValue value={metadataHash} full /> });
        current = 2;
      }
      update(current, { state: "bezig" });
      const passport = await writer();
      const tx = await passport.registerBatch({
        materialType: form.materialType.trim(),
        quantity: BigInt(form.quantity),
        unit: form.unit,
        level: Number(form.level),
        origin: form.origin.trim(),
        productionDate: BigInt(secondsFromDateInput(form.productionDate)),
        metadataURI,
        metadataHash,
      });
      const receipt = await tx.wait();
      const event = receipt?.logs
        .map((log) => contract.interface.parseLog(log))
        .find((parsed) => parsed?.name === "TimelineEvent");
      update(current, { state: "klaar", detail: <p className="stil">Transactie {tx.hash.slice(0, 10)}… bevestigd</p> });
      await reload();
      setRegistered(event ? (event.args.batchId as bigint) : await contract.batchCount());
    } catch (error) {
      update(current, { state: "fout" });
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
                  setFile(null);
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
          <span>Materiaalsoort *</span>
          <input
            value={form.materialType}
            onChange={(e) => set("materialType")(e.target.value)}
            placeholder="bijv. Staal S355, HEA 200"
            aria-invalid={!!errors.materialType}
            aria-describedby={errorId("materialType")}
          />
          {errors.materialType && <span className="veldfout" id="fout-materialType">{errors.materialType}</span>}
        </label>

        <div className="rij">
          <label className="veld">
            <span>Hoeveelheid *</span>
            <input
              inputMode="numeric"
              value={form.quantity}
              onChange={(e) => set("quantity")(e.target.value.trim())}
              aria-invalid={!!errors.quantity}
              aria-describedby={errorId("quantity")}
            />
            {errors.quantity && <span className="veldfout" id="fout-quantity">{errors.quantity}</span>}
          </label>
          <label className="veld">
            <span>Eenheid *</span>
            <select
              value={form.unit}
              onChange={(e) => set("unit")(e.target.value)}
              aria-invalid={!!errors.unit}
              aria-describedby={errorId("unit")}
            >
              <option value="">Kies…</option>
              {UNITS.map((unit) => (
                <option key={unit}>{unit}</option>
              ))}
            </select>
            {errors.unit && <span className="veldfout" id="fout-unit">{errors.unit}</span>}
          </label>
        </div>

        <fieldset className="keuzes" aria-invalid={!!errors.level} aria-describedby={errorId("level")}>
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
          {errors.level && <span className="veldfout" id="fout-level">{errors.level}</span>}
        </fieldset>

        <div className="rij">
          <label className="veld">
            <span>Herkomst</span>
            <input
              value={form.origin}
              onChange={(e) => set("origin")(e.target.value)}
              placeholder="Producent of donorgebouw"
            />
          </label>
          <label className="veld">
            <span>Productie- of demontagedatum</span>
            <input type="date" value={form.productionDate} onChange={(e) => set("productionDate")(e.target.value)} />
          </label>
        </div>

        <label className="veld">
          <span>Paspoortdocument (optioneel)</span>
          <input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          <span className="hulp">
            Wordt eerst opgeslagen; de hash over de inhoud gaat mee in de transactie.
          </span>
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
