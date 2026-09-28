import { useState, type FormEvent } from "react";
import { Address, HashValue } from "../components/ui";
import { hashBytes, readBytes } from "../lib/documents";
import { hasDocument, KIND_LABEL, lineage, type Line } from "../lib/domain";
import { formatDateTime } from "../lib/format";
import { href } from "../lib/router";
import { usePassport } from "../state";

type Outcome =
  | { batchId: bigint; name: string; hash: string; matches: Line[]; recorded: Line[] }
  | { batchId: bigint; missing: true };

/**
 * Scherm G: los bestand controleren tegen de tijdlijn van een batch
 * (requirement 5). Wijzig één byte en de uitkomst slaat om.
 */
export function Verify({ initialId }: { initialId?: bigint }) {
  const { snapshot } = usePassport();
  const [batchInput, setBatchInput] = useState(initialId?.toString() ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [busy, setBusy] = useState(false);

  async function check(event: FormEvent) {
    event.preventDefault();
    setOutcome(null);
    if (!/^\d+$/.test(batchInput.trim())) return setProblem("Vul een batch-ID in.");
    if (!file) return setProblem("Kies het bestand dat je wilt controleren.");
    if (!snapshot) return setProblem("De gegevens van de keten zijn nog niet geladen.");
    setProblem(null);
    setBusy(true);
    try {
      const batchId = BigInt(batchInput.trim());
      if (!snapshot.batches.has(batchId)) return setOutcome({ batchId, missing: true });
      const hash = hashBytes(await readBytes(file));
      const recorded = lineage(batchId, snapshot.batches, snapshot.lines).filter(hasDocument);
      const matches = recorded.filter((line) => line.documentHash.toLowerCase() === hash.toLowerCase());
      setOutcome({ batchId, name: file.name, hash, matches, recorded });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="formulier">
      <h1>Document verifiëren</h1>
      <p>
        Controleer of een bestand precies zo is vastgelegd bij een batch. De app berekent de hash over de inhoud van het
        bestand en zoekt die op de tijdlijn. Eén gewijzigde byte levert een compleet andere hash op.
      </p>

      <form onSubmit={check}>
        <div className="rij onder">
          <label className="veld smal">
            <span>Batch-ID</span>
            <input inputMode="numeric" value={batchInput} onChange={(e) => setBatchInput(e.target.value)} />
          </label>
          <label className="veld">
            <span>Bestand</span>
            <input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </label>
          <button type="submit" className="knop primair" disabled={busy}>
            Controleren
          </button>
        </div>
        {problem && (
          <p className="veldfout" role="alert">
            {problem}
          </p>
        )}
      </form>

      {outcome && "missing" in outcome && (
        <p className="reden blok" role="alert">
          Batch #{outcome.batchId.toString()} bestaat niet.
        </p>
      )}

      {outcome && !("missing" in outcome) && (
        <section className="uitkomst" aria-live="polite">
          <p>
            Hash van <strong>{outcome.name}</strong>: <HashValue value={outcome.hash} full />
          </p>
          {outcome.matches.length > 0 ? (
            <div className="verificatie-uitkomst ok">
              <p className="verificatie ok">
                <span className="verificatie-icoon" aria-hidden="true">
                  ✔
                </span>
                Gevonden: dit bestand is ongewijzigd sinds het werd vastgelegd.
              </p>
              <ul>
                {outcome.matches.map((line) => (
                  <li key={line.key}>
                    {line.kind ? KIND_LABEL[line.kind] : "Gebeurtenis"} op {formatDateTime(line.timestamp)}, ingediend door{" "}
                    <Address value={line.actor} withRoles />
                    {line.inheritedFrom !== undefined && <> (uit de historie van batch #{line.inheritedFrom.toString()})</>}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="verificatie-uitkomst fout">
              <p className="verificatie fout">
                <span className="verificatie-icoon" aria-hidden="true">
                  ✖
                </span>
                Niet gevonden: deze hash komt niet voor op de tijdlijn van batch #{outcome.batchId.toString()}.
              </p>
              <p>
                Het bestand is niet bij deze batch vastgelegd, of het is gewijzigd sinds het werd vastgelegd.
              </p>
            </div>
          )}

          <details>
            <summary>Vastgelegde documenten bij batch #{outcome.batchId.toString()} ({outcome.recorded.length})</summary>
            <ul className="vastgelegd">
              {outcome.recorded.map((line) => (
                <li key={line.key}>
                  {formatDateTime(line.timestamp)} · {line.kind ? KIND_LABEL[line.kind] : "Gebeurtenis"} ·{" "}
                  <HashValue value={line.documentHash} />
                </li>
              ))}
            </ul>
          </details>
          <p>
            <a href={href.batch(outcome.batchId)}>Naar batch #{outcome.batchId.toString()}</a>
          </p>
        </section>
      )}
    </div>
  );
}
