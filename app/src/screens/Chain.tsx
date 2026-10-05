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
  registerBatch: "register batch",
  assignRole: "assign role",
  addClaim: "add claim",
  setRole: "assign role (claims)",
};

/**
 * "Chain" screen (developer view): the raw blocks, live. Shows that
 * everything in the app comes from on-chain transactions, and that every
 * block refers to the previous one by its hash.
 */
export function Chain({ focus }: { focus?: number }) {
  const { provider, contract, claims, deployment, blockNumber, developer, setDeveloper } = usePassport();
  const [count, setCount] = useState(PAGE);
  const [blocks, setBlocks] = useState<ChainBlock[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const needed = focus !== undefined && blockNumber !== null ? Math.max(count, blockNumber - focus + 3) : count;

  useEffect(() => {
    if (blockNumber === null || !developer) return;
    let cancelled = false;
    const contracts = [{ interface: contract.interface, address: deployment.address }];
    if (claims && deployment.claimRegistry) contracts.push({ interface: claims.interface, address: deployment.claimRegistry.address });
    loadBlocks(provider, contracts, blockNumber, Math.max(0, blockNumber - needed + 1)).then(
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
  }, [provider, contract, claims, deployment, blockNumber, needed, developer]);

  const loaded = blocks !== null;
  useEffect(() => {
    if (focus !== undefined && loaded) document.getElementById(`block-${focus}`)?.scrollIntoView({ block: "start" });
  }, [focus, loaded]);

  if (!developer) {
    return (
      <div className="empty">
        <h1>Chain</h1>
        <p>This screen is part of the developer view.</p>
        <button type="button" className="button primary" onClick={() => setDeveloper(true)}>
          Turn on developer view
        </button>
      </div>
    );
  }

  const links = blocks?.slice(0, -1).map((block, i) => block.parentHash === blocks[i + 1].hash) ?? [];
  const intact = links.every(Boolean);

  return (
    <>
      <div className="heading-row">
        <h1>Chain</h1>
        <p className="muted">
          MaterialPassport <Address value={deployment.address} />
          {deployment.claimRegistry && (
            <>
              {" "}
              · ClaimRegistry <Address value={deployment.claimRegistry.address} />
            </>
          )}
        </p>
      </div>
      <p>
        All data in this app comes from the transactions below. Each block contains the hash of the previous block: anyone
        who changes an old block changes its hash and breaks the chain from that point on. Rejected actions do not appear
        here: the contract refuses them before they end up in a block.
      </p>

      {error && (
        <p className="reason block" role="alert">
          {error}
        </p>
      )}

      {!blocks ? (
        <div aria-busy="true" aria-label="Loading blocks">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} height="7rem" />
          ))}
        </div>
      ) : (
        <>
          <p className={`verification ${intact ? "ok" : "error"}`} role="status">
            <span className="verification-icon" aria-hidden="true">
              {intact ? "✔" : "✖"}
            </span>
            {intact
              ? `Chain is intact: each of the ${blocks.length} blocks shown points to the previous one by its hash.`
              : "Chain is broken: a block does not point to the hash of its predecessor."}
          </p>
          <ol className="blocks">
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
            <div className="buttons">
              <button type="button" className="button" onClick={() => setCount(needed + PAGE)}>
                Load older blocks
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
    <li id={`block-${block.number}`} className={focused ? "block highlighted" : "block"}>
      <div className="block-header">
        <h2>Block #{block.number}</h2>
        <time>{formatDateTime(block.timestamp)}</time>
        {block.number === 0 && <span className="label">genesis block</span>}
      </div>
      <dl className="hashes">
        <dt>Hash of this block</dt>
        <dd>
          <HashValue value={block.hash} />
        </dd>
        <dt>Hash of previous block</dt>
        <dd>
          <HashValue value={block.parentHash} />
          {linked !== undefined && (
            <span className="muted">
              {" "}
              {linked ? `= hash of block #${block.number - 1}` : `≠ hash of block #${block.number - 1}`}
            </span>
          )}
        </dd>
      </dl>
      {block.txs.length === 0 ? (
        <p className="muted">No transactions.</p>
      ) : (
        block.txs.map((tx) => <TxView key={tx.hash} tx={tx} />)
      )}
    </li>
  );
}

function TxView({ tx }: { tx: ChainTx }) {
  const { deployment } = usePassport();
  const known = [deployment.address, deployment.claimRegistry?.address].filter((a): a is string => !!a);
  const toContract = tx.to !== null && known.some((a) => a.toLowerCase() === tx.to!.toLowerCase());
  const deployedName =
    tx.deployed && tx.deployed.toLowerCase() === deployment.claimRegistry?.address.toLowerCase()
      ? "ClaimRegistry"
      : "MaterialPassport";
  const title = tx.call
    ? `${tx.call.name}${CALL_LABEL[tx.call.name] ? ` · ${CALL_LABEL[tx.call.name]}` : ""}`
    : tx.deployed
      ? "Contract deployed"
      : "Transaction";

  return (
    <div className="tx">
      <p className="tx-header">
        <strong>{title}</strong>
        {!tx.ok && <span className="label">reverted</span>}
      </p>
      <p className="line-actor">
        <span className="muted">signed by</span> <Address value={tx.from} withRole />
        {tx.to && !toContract && (
          <>
            <span className="muted">to</span> <Address value={tx.to} />
          </>
        )}
      </p>
      {tx.deployed && (
        <p>
          {deployedName} at <Address value={tx.deployed} />
        </p>
      )}
      {tx.call && tx.call.params.length > 0 && <Params params={tx.call.params} />}
      {tx.events.length > 0 && (
        <details>
          <summary>Emitted events ({tx.events.map((e) => e.name).join(", ")})</summary>
          {tx.events.map((event, i) => (
            <div key={i} className="event">
              <p className="event-name">{event.name}</p>
              <Params params={event.params} />
            </div>
          ))}
        </details>
      )}
      <p className="muted small">
        Transaction <HashValue value={tx.hash} /> · {tx.gasUsed.toLocaleString("en-GB")} gas
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
    if (!text) return <span className="muted">(empty)</span>;
    return /^https?:\/\//.test(text) ? (
      <a href={text} target="_blank" rel="noreferrer" className="break">
        {text}
      </a>
    ) : (
      <span>"{text}"</span>
    );
  }
  if (type.type === "bool") return <>{value ? "yes" : "no"}</>;
  if (name === "level" || name === "_level") return <>{String(value)} <span className="muted">({LEVELS[Number(value)]})</span></>;
  if (name === "productionDate" || name === "_productionDate" || name === "timestamp") {
    return <>{String(value)} <span className="muted">({Number(value) === 0 ? "empty" : formatDateTime(Number(value))})</span></>;
  }
  if (name === "batchId" || name === "id" || name === "_id") {
    return <a href={href.batch(BigInt(String(value)))}>{String(value)}</a>;
  }
  return <code>{String(value)}</code>;
}
