import type { ParamType, Result } from "ethers";
import { useEffect, useState } from "react";
import { Address, HashValue, Skeleton } from "../components/ui";
import { LEVELS } from "../lib/domain";
import { explainError } from "../lib/errors";
import { loadBlocks, type ChainBlock, type ChainTx, type Decoded } from "../lib/explorer";
import { formatDateTime, shortHash } from "../lib/format";
import { href } from "../lib/router";
import { usePassport } from "../state";

const PAGE = 15;

const CALL_LABEL: Record<string, string> = {
  registerBatch: "batch registreren",
  assignRole: "rol toekennen",
};

/**
 * "Keten" screen (developer view): the raw blocks, live. Shows that
 * everything in the app comes from on-chain transactions, and that every
 * block refers to the previous one by its hash.
 */
export function Chain({ focus }: { focus?: number }) {
  const { provider, contract, deployment, blockNumber, developer, setDeveloper } = usePassport();
  const [count, setCount] = useState(PAGE);
  const [blocks, setBlocks] = useState<ChainBlock[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const needed = focus !== undefined && blockNumber !== null ? Math.max(count, blockNumber - focus + 3) : count;

  useEffect(() => {
    if (blockNumber === null || !developer) return;
    let cancelled = false;
    loadBlocks(provider, contract.interface, deployment.address, blockNumber, Math.max(0, blockNumber - needed + 1)).then(
      (loaded) => {
        if (cancelled) return;
        setBlocks(loaded);
        setError(null);
      },
      (e) => !cancelled && setError(explainError(e).message),
    );
    return () => {
      cancelled = true;
    };
  }, [provider, contract, deployment, blockNumber, needed, developer]);

  const loaded = blocks !== null;
  useEffect(() => {
    if (focus !== undefined && loaded) document.getElementById(`blok-${focus}`)?.scrollIntoView({ block: "start" });
  }, [focus, loaded]);

  if (!developer) {
    return (
      <div className="leeg">
        <h1>Keten</h1>
        <p>Dit scherm hoort bij de ontwikkelaarsweergave.</p>
        <button type="button" className="knop primair" onClick={() => setDeveloper(true)}>
          Ontwikkelaarsweergave aanzetten
        </button>
      </div>
    );
  }

  const links = blocks?.slice(0, -1).map((block, i) => block.parentHash === blocks[i + 1].hash) ?? [];
  const intact = links.every(Boolean);

  return (
    <>
      <div className="kop-rij">
        <h1>Keten</h1>
        <p className="stil">
          Contract <Address value={deployment.address} />
        </p>
      </div>
      <p>
        Alle gegevens in deze app komen uit onderstaande transacties. Elk blok bevat de hash van het vorige blok: wie een
        oud blok wijzigt, verandert die hash en breekt de keten vanaf dat punt. Geweigerde handelingen komen hier niet: het
        contract weigert ze voordat ze in een blok belanden.
      </p>

      {error && (
        <p className="reden blok" role="alert">
          {error}
        </p>
      )}

      {!blocks ? (
        <div aria-busy="true" aria-label="Blokken laden">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} height="7rem" />
          ))}
        </div>
      ) : (
        <>
          <p className={`verificatie ${intact ? "ok" : "fout"}`} role="status">
            <span className="verificatie-icoon" aria-hidden="true">
              {intact ? "✔" : "✖"}
            </span>
            {intact
              ? `Keten klopt: elk van de ${blocks.length} getoonde blokken verwijst met zijn hash naar het vorige.`
              : "Keten klopt niet: een blok verwijst niet naar de hash van zijn voorganger."}
          </p>
          <ol className="blokken">
            {blocks.map((block, i) => (
              <BlockCard
                key={block.number}
                block={block}
                focused={block.number === focus}
                linked={i < blocks.length - 1 ? links[i] : undefined}
              />
            ))}
          </ol>
          {blocks[blocks.length - 1].number > 0 && (
            <div className="knoppen">
              <button type="button" className="knop" onClick={() => setCount(needed + PAGE)}>
                Oudere blokken laden
              </button>
            </div>
          )}
        </>
      )}
    </>
  );
}

function BlockCard({ block, focused, linked }: { block: ChainBlock; focused: boolean; linked?: boolean }) {
  return (
    <li id={`blok-${block.number}`} className={focused ? "blok gemarkeerd" : "blok"}>
      <div className="blok-kop">
        <h2>Blok #{block.number}</h2>
        <time>{formatDateTime(block.timestamp)}</time>
        {block.number === 0 && <span className="label">startblok</span>}
      </div>
      <dl className="hashes">
        <dt>Hash van dit blok</dt>
        <dd>
          <HashValue value={block.hash} />
        </dd>
        <dt>Hash van vorig blok</dt>
        <dd>
          <HashValue value={block.parentHash} />
          {linked !== undefined && (
            <span className="stil">
              {" "}
              {linked ? `= hash van blok #${block.number - 1}` : `≠ hash van blok #${block.number - 1}`}
            </span>
          )}
        </dd>
      </dl>
      {block.txs.length === 0 ? (
        <p className="stil">Geen transacties.</p>
      ) : (
        block.txs.map((tx) => <TxView key={tx.hash} tx={tx} />)
      )}
    </li>
  );
}

function TxView({ tx }: { tx: ChainTx }) {
  const { deployment } = usePassport();
  const toContract = tx.to?.toLowerCase() === deployment.address.toLowerCase();
  const title = tx.call
    ? `${tx.call.name}${CALL_LABEL[tx.call.name] ? ` · ${CALL_LABEL[tx.call.name]}` : ""}`
    : tx.deployed
      ? "Contract uitgerold"
      : "Transactie";

  return (
    <div className="tx">
      <p className="tx-kop">
        <strong>{title}</strong>
        {!tx.ok && <span className="label">teruggedraaid</span>}
      </p>
      <p className="regel-actor">
        <span className="stil">getekend door</span> <Address value={tx.from} withRole />
        {tx.to && !toContract && (
          <>
            <span className="stil">naar</span> <Address value={tx.to} />
          </>
        )}
      </p>
      {tx.deployed && (
        <p>
          MaterialPassport op <Address value={tx.deployed} />
        </p>
      )}
      {tx.call && tx.call.params.length > 0 && <Params params={tx.call.params} />}
      {tx.events.length > 0 && (
        <details>
          <summary>Uitgezonden events ({tx.events.map((e) => e.name).join(", ")})</summary>
          {tx.events.map((event, i) => (
            <div key={i} className="event">
              <p className="event-naam">{event.name}</p>
              <Params params={event.params} />
            </div>
          ))}
        </details>
      )}
      <p className="stil klein">
        Transactie <HashValue value={tx.hash} /> · {tx.gasUsed.toLocaleString("nl-NL")} gas
      </p>
    </div>
  );
}

function Params({ params }: { params: Decoded[] }) {
  return (
    <dl className="params">
      {params.map((param, i) => (
        <Param key={i} name={param.name} type={param.type} value={param.value} />
      ))}
    </dl>
  );
}

function Param({ name, type, value }: { name: string; type: ParamType; value: unknown }) {
  return (
    <>
      <dt>
        <code>{name || "–"}</code>
      </dt>
      <dd>
        <Value name={name} type={type} value={value} />
      </dd>
    </>
  );
}

/** Make an argument readable without hiding the raw value. */
function Value({ name, type, value }: { name: string; type: ParamType; value: unknown }) {
  if (type.baseType === "tuple" && type.components) {
    const values = value as Result;
    return (
      <dl className="params">
        {type.components.map((component, i) => (
          <Param key={i} name={component.name} type={component} value={values[i]} />
        ))}
      </dl>
    );
  }
  if (type.baseType === "array") {
    return <code>[{(value as unknown[]).map(String).join(", ")}]</code>;
  }
  if (type.type === "address") return <Address value={String(value)} withRole />;
  if (type.type === "string") {
    const text = String(value);
    if (!text) return <span className="stil">(leeg)</span>;
    return /^https?:\/\//.test(text) ? (
      <a href={text} target="_blank" rel="noreferrer" className="breek">
        {text}
      </a>
    ) : (
      <span>"{text}"</span>
    );
  }
  if (type.type === "bool") return <>{value ? "ja" : "nee"}</>;
  if (name === "level" || name === "_level") return <>{String(value)} <span className="stil">({LEVELS[Number(value)]})</span></>;
  if (name === "productionDate" || name === "_productionDate" || name === "timestamp") {
    return <>{String(value)} <span className="stil">({Number(value) === 0 ? "leeg" : formatDateTime(Number(value))})</span></>;
  }
  if (name === "batchId" || name === "id" || name === "_id") {
    return <a href={href.batch(BigInt(String(value)))}>{String(value)}</a>;
  }
  return <code>{String(value)}</code>;
}
