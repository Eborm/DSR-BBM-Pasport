import { useMemo, useState } from "react";
import { ActionButton, Skeleton } from "../components/ui";
import { canRegister, CLASSIFICATION_LABEL, LEVELS, SOURCE_FILE_LABEL } from "../lib/domain";
import { formatDateTime, shortAddress } from "../lib/format";
import { href, navigate } from "../lib/router";
import { usePassport } from "../state";

/** Screen A: find all batches. */
export function Overview() {
  const { snapshot, role, nameOf } = usePassport();
  const [query, setQuery] = useState("");
  const [level, setLevel] = useState("");

  const rows = useMemo(() => (snapshot ? [...snapshot.batches.values()] : []), [snapshot]);

  const needle = query.trim().toLowerCase();
  const filtered = rows.filter(
    (batch) =>
      (!needle || `${batch.producer} ${batch.materialType} ${batch.origin}`.toLowerCase().includes(needle)) &&
      (!level || batch.level === Number(level)),
  );
  const filtering = needle !== "" || level !== "";
  const reset = () => {
    setQuery("");
    setLevel("");
  };

  const register = canRegister(role);
  const toRegister = () => navigate(href.registreren());

  return (
    <>
      <div className="kop-rij">
        <h1>Batches</h1>
        <ActionButton permission={register} onClick={toRegister} primary>
          Nieuwe batch registreren
        </ActionButton>
      </div>

      <div className="filters" role="search">
        <label className="veld zoek">
          <span>Zoeken op producent, materiaalsoort of herkomst</span>
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="bijv. staal, Heerlen" />
        </label>
        <label className="veld">
          <span>Niveau</span>
          <select value={level} onChange={(e) => setLevel(e.target.value)}>
            <option value="">Alle</option>
            {LEVELS.map((label, index) => (
              <option key={label} value={index}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {!snapshot ? (
        <TableSkeleton />
      ) : rows.length === 0 ? (
        <div className="leeg">
          <p>Nog geen batches geregistreerd.</p>
          <ActionButton permission={register} onClick={toRegister} primary>
            Eerste batch registreren
          </ActionButton>
        </div>
      ) : filtered.length === 0 ? (
        <div className="leeg">
          <p>Geen batches gevonden die aan deze zoekopdracht voldoen.</p>
          <button type="button" className="knop" onClick={reset}>
            Filters wissen
          </button>
        </div>
      ) : (
        <>
          <p className="stil" aria-live="polite">
            {filtered.length} {filtered.length === 1 ? "batch" : "batches"}
            {filtering && ` van ${rows.length}`}
          </p>
          <div className="tabel">
            <table>
              <thead>
                <tr>
                  <th scope="col">ID</th>
                  <th scope="col">Producent</th>
                  <th scope="col">Materiaalsoort</th>
                  <th scope="col">Classificatie</th>
                  <th scope="col">Niveau</th>
                  <th scope="col" className="getal">
                    Massa (kg)
                  </th>
                  <th scope="col">Herkomst</th>
                  <th scope="col">Bron</th>
                  <th scope="col">Eigenaar</th>
                  <th scope="col">Geregistreerd</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((batch) => (
                  <tr key={batch.id.toString()} className="klikbaar" onClick={() => navigate(href.batch(batch.id))}>
                    <td>
                      <a href={href.batch(batch.id)}>#{batch.id.toString()}</a>
                    </td>
                    <td>{batch.producer}</td>
                    <td>{batch.materialType}</td>
                    <td>{CLASSIFICATION_LABEL[batch.classification]}</td>
                    <td>{LEVELS[batch.level]}</td>
                    <td className="getal">{batch.mass.toString()}</td>
                    <td>{batch.origin || <span className="stil">–</span>}</td>
                    <td>{SOURCE_FILE_LABEL[batch.sourceFile]}</td>
                    <td>{nameOf(batch.currentOwner) ?? shortAddress(batch.currentOwner)}</td>
                    <td>{formatDateTime(batch.registeredAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}

function TableSkeleton() {
  return (
    <div className="tabel" aria-busy="true" aria-label="Batches laden">
      <table>
        <tbody>
          {[0, 1, 2, 3].map((row) => (
            <tr key={row}>
              {["3rem", "10rem", "8rem", "4rem", "6rem", "5rem", "8rem", "8rem", "8rem", "8rem"].map((width, cell) => (
                <td key={cell}>
                  <Skeleton width={width} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
