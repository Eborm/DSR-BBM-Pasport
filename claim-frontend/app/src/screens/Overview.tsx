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
  const toRegister = () => navigate(href.register());

  return (
    <>
      <div className="heading-row">
        <h1>Batches</h1>
        <ActionButton permission={register} onClick={toRegister} primary>
          Register new batch
        </ActionButton>
      </div>

      <div className="filters" role="search">
        <label className="field search">
          <span>Search by producer, material type or origin</span>
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="e.g. steel, Heerlen" />
        </label>
        <label className="field">
          <span>Level</span>
          <select value={level} onChange={(e) => setLevel(e.target.value)}>
            <option value="">All</option>
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
        <div className="empty">
          <p>No batches registered yet.</p>
          <ActionButton permission={register} onClick={toRegister} primary>
            Register the first batch
          </ActionButton>
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty">
          <p>No batches found that match this search.</p>
          <button type="button" className="button" onClick={reset}>
            Clear filters
          </button>
        </div>
      ) : (
        <>
          <p className="muted" aria-live="polite">
            {filtered.length} {filtered.length === 1 ? "batch" : "batches"}
            {filtering && ` of ${rows.length}`}
          </p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th scope="col">ID</th>
                  <th scope="col">Producer</th>
                  <th scope="col">Material type</th>
                  <th scope="col">Classification</th>
                  <th scope="col">Level</th>
                  <th scope="col" className="number">
                    Mass (kg)
                  </th>
                  <th scope="col">Origin</th>
                  <th scope="col">Source</th>
                  <th scope="col">Owner</th>
                  <th scope="col">Registered</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((batch) => (
                  <tr key={batch.id.toString()} className="clickable" onClick={() => navigate(href.batch(batch.id))}>
                    <td>
                      <a href={href.batch(batch.id)}>#{batch.id.toString()}</a>
                    </td>
                    <td>{batch.producer}</td>
                    <td>{batch.materialType}</td>
                    <td>{CLASSIFICATION_LABEL[batch.classification]}</td>
                    <td>{LEVELS[batch.level]}</td>
                    <td className="number">{batch.mass.toString()}</td>
                    <td>{batch.origin || <span className="muted">–</span>}</td>
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
    <div className="table-wrap" aria-busy="true" aria-label="Loading batches">
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
