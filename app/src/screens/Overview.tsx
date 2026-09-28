import { useMemo, useState } from "react";
import { ActionButton, Skeleton, StatusBadge } from "../components/ui";
import { canRegister, lineage, LEVELS, STATUS_LABEL, statusOf, type Status } from "../lib/domain";
import { formatQuantity, shortAddress } from "../lib/format";
import { href, navigate } from "../lib/router";
import { usePassport } from "../state";

/** Scherm A: alle batches vinden (requirement 1 en 8). */
export function Overview() {
  const { snapshot, roles, nameOf } = usePassport();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<Status | "">("");
  const [level, setLevel] = useState("");
  const [owner, setOwner] = useState("");

  const rows = useMemo(
    () =>
      snapshot
        ? [...snapshot.batches.values()].map((batch) => ({
            batch,
            status: statusOf(lineage(batch.id, snapshot.batches, snapshot.lines)),
          }))
        : [],
    [snapshot],
  );
  const owners = useMemo(() => [...new Set(rows.map((row) => row.batch.owner))], [rows]);

  const needle = query.trim().toLowerCase();
  const filtered = rows.filter(
    ({ batch, status: s }) =>
      (!needle || `${batch.materialType} ${batch.origin}`.toLowerCase().includes(needle)) &&
      (!status || s === status) &&
      (!level || batch.level === Number(level)) &&
      (!owner || batch.owner === owner),
  );
  const filtering = needle !== "" || status !== "" || level !== "" || owner !== "";
  const reset = () => {
    setQuery("");
    setStatus("");
    setLevel("");
    setOwner("");
  };

  const register = canRegister(roles);
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
          <span>Zoeken op materiaalsoort of herkomst</span>
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="bijv. staal, Heerlen" />
        </label>
        <label className="veld">
          <span>Status</span>
          <select value={status} onChange={(e) => setStatus(e.target.value as Status | "")}>
            <option value="">Alle</option>
            {(Object.keys(STATUS_LABEL) as Status[]).map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
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
        <label className="veld">
          <span>Eigenaar</span>
          <select value={owner} onChange={(e) => setOwner(e.target.value)}>
            <option value="">Alle</option>
            {owners.map((address) => (
              <option key={address} value={address}>
                {nameOf(address) ?? shortAddress(address)}
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
                  <th scope="col">Materiaalsoort</th>
                  <th scope="col" className="getal">
                    Hoeveelheid
                  </th>
                  <th scope="col">Niveau</th>
                  <th scope="col">Herkomst</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(({ batch, status: s }) => (
                  <tr key={batch.id.toString()} className="klikbaar" onClick={() => navigate(href.batch(batch.id))}>
                    <td>
                      <a href={href.batch(batch.id)}>#{batch.id.toString()}</a>
                    </td>
                    <td>
                      {batch.materialType}
                      {batch.parentId !== 0n && <span className="stil klein"> · uit #{batch.parentId.toString()}</span>}
                    </td>
                    <td className="getal">{formatQuantity(batch.quantity, batch.unit)}</td>
                    <td>{LEVELS[batch.level]}</td>
                    <td>{batch.origin || <span className="stil">–</span>}</td>
                    <td>
                      <StatusBadge status={s} />
                    </td>
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
              {["3rem", "14rem", "6rem", "7rem", "10rem", "6rem"].map((width, cell) => (
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
