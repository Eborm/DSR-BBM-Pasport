import { useEffect, useState } from "react";
import { QrCode } from "../components/QrCode";
import { ActionButton, Address, HashValue, Skeleton, StatusBadge, VerificationBadge } from "../components/ui";
import { fileNameFromUri, verifyDocument, type Verification } from "../lib/documents";
import {
  canClaimAny,
  canSplit,
  canTransfer,
  hasDocument,
  KIND_LABEL,
  lineage,
  LEVELS,
  statusOf,
  type Batch,
  type Line,
} from "../lib/domain";
import { formatDate, formatDateTime, formatQuantity } from "../lib/format";
import { href, navigate } from "../lib/router";
import { usePassport } from "../state";

/**
 * Controleert elk document op de tijdlijn: ophalen, hash opnieuw berekenen,
 * vergelijken met de keten. Draait automatisch bij het openen (SPEC §6.2 B).
 */
function useVerifications(lines: Line[]) {
  const [results, setResults] = useState(new Map<string, Verification>());
  const [round, setRound] = useState(0);
  const withDocuments = lines.filter(hasDocument);
  const signature = withDocuments.map((line) => line.key).join(",");

  useEffect(() => {
    let cancelled = false;
    setResults(new Map(withDocuments.map((line) => [line.key, { state: "controleren" }])));
    for (const line of withDocuments) {
      void verifyDocument(line.documentURI, line.documentHash).then((result) => {
        if (!cancelled) setResults((previous) => new Map(previous).set(line.key, result));
      });
    }
    return () => {
      cancelled = true;
    };
    // `signature` vat `withDocuments` samen; een nieuw blok zonder nieuwe regels controleert niet opnieuw.
  }, [signature, round]);

  return { results, recheck: () => setRound((r) => r + 1) };
}

/** Scherm B: kop, tijdlijn en acties. */
export function BatchDetail({ id }: { id: bigint }) {
  const { snapshot, roles, account } = usePassport();
  const batch = snapshot?.batches.get(id);
  const lines = snapshot && batch ? lineage(id, snapshot.batches, snapshot.lines) : [];
  const { results, recheck } = useVerifications(lines);

  if (!snapshot) return <DetailSkeleton />;
  if (!batch) {
    return (
      <div className="leeg">
        <h1>Batch #{id.toString()} bestaat niet</h1>
        <p>Er is geen batch met dit ID geregistreerd. Controleer het nummer of de QR-code.</p>
        <a className="knop" href={href.overzicht()}>
          Naar het overzicht
        </a>
      </div>
    );
  }

  const isOwner = account?.address.toLowerCase() === batch.owner.toLowerCase();
  const children = [...snapshot.batches.values()].filter((b) => b.parentId === id);
  const inherited = lines.filter((line) => line.inheritedFrom !== undefined).length;

  return (
    <>
      <section className="batch-kop" aria-labelledby="batch-titel">
        <div>
          <p className="bovenschrift">
            Batch #{id.toString()} · {LEVELS[batch.level]}
          </p>
          <h1 id="batch-titel">{batch.materialType}</h1>
          <p>
            <StatusBadge status={statusOf(lines)} />
          </p>
          <dl className="kenmerken">
            <dt>ID</dt>
            <dd>#{id.toString()}</dd>
            <dt>Hoeveelheid</dt>
            <dd>{formatQuantity(batch.quantity, batch.unit)}</dd>
            <dt>Niveau</dt>
            <dd>{LEVELS[batch.level]}</dd>
            <dt>Herkomst</dt>
            <dd>{batch.origin || "–"}</dd>
            <dt>Productiedatum</dt>
            <dd>{formatDate(batch.productionDate)}</dd>
            <dt>Huidige eigenaar</dt>
            <dd>
              <Address value={batch.owner} withRoles />
            </dd>
            <dt>Geregistreerd door</dt>
            <dd>
              <Address value={batch.registrant} />
            </dd>
            {batch.parentId !== 0n && (
              <>
                <dt>Afgesplitst uit</dt>
                <dd>
                  <a href={href.batch(batch.parentId)}>Batch #{batch.parentId.toString()}</a>
                </dd>
              </>
            )}
            {children.length > 0 && (
              <>
                <dt>Afgesplitste batches</dt>
                <dd>
                  {children.map((child, index) => (
                    <span key={child.id.toString()}>
                      {index > 0 && ", "}
                      <a href={href.batch(child.id)}>#{child.id.toString()}</a> (
                      {formatQuantity(child.quantity, child.unit)})
                    </span>
                  ))}
                </dd>
              </>
            )}
          </dl>
        </div>
        <QrCode batch={batch} />
      </section>

      <section aria-labelledby="tijdlijn-titel">
        <div className="kop-rij">
          <h2 id="tijdlijn-titel">Tijdlijn</h2>
          <button type="button" className="knop klein" onClick={recheck}>
            Documenten opnieuw controleren
          </button>
        </div>
        <p className="stil">
          Chronologisch, nieuwste onderaan.
          {inherited > 0 &&
            ` De eerste ${inherited} regels komen uit de historie van batch #${batch.parentId} en gelden ook voor deze batch.`}
        </p>
        <ol className="tijdlijn">
          {lines.map((line) => (
            <TimelineItem key={`${line.key}-${line.batchId}`} line={line} batch={batch} verification={results.get(line.key)} />
          ))}
        </ol>
      </section>

      <section aria-labelledby="acties-titel">
        <h2 id="acties-titel">Acties</h2>
        <div className="acties">
          <ActionButton permission={canClaimAny(roles, isOwner)} onClick={() => navigate(href.claim(id))} primary>
            Claim toevoegen
          </ActionButton>
          <ActionButton permission={canTransfer(roles, isOwner)} onClick={() => navigate(href.overdragen(id))}>
            Eigendom overdragen
          </ActionButton>
          <ActionButton permission={canSplit(roles, isOwner, batch.quantity)} onClick={() => navigate(href.splitsen(id))}>
            Splitsen
          </ActionButton>
        </div>
        <p className="stil">
          <a href={href.verifieren(id)}>Een los bestand controleren tegen deze batch</a>
        </p>
      </section>
    </>
  );
}

function TimelineItem({ line, batch, verification }: { line: Line; batch: Batch; verification?: Verification }) {
  const { developer } = usePassport();
  const kind = line.kind ? KIND_LABEL[line.kind] : "Onbekende gebeurtenis";
  return (
    <li className={line.inheritedFrom !== undefined ? "geerfd" : undefined}>
      <p className="regel-kop">
        <time>{formatDateTime(line.timestamp)}</time>
        <strong>{kind}</strong>
        {line.inheritedFrom !== undefined && <span className="label">uit batch #{line.inheritedFrom.toString()}</span>}
      </p>
      <p className="regel-actor">
        <span className="stil">door</span> <Address value={line.actor} withRoles />
      </p>
      {line.description && <p>{line.description}</p>}
      {line.kind === "transfer" && line.transferTo && (
        <p>
          Overgedragen aan <Address value={line.transferTo} />
        </p>
      )}
      {line.split &&
        (line.split.parentId === line.batchId ? (
          <p>
            {formatQuantity(line.split.amount, batch.unit)} afgesplitst naar{" "}
            <a href={href.batch(line.split.childId)}>batch #{line.split.childId.toString()}</a>
          </p>
        ) : (
          <p>
            Ontstaan uit <a href={href.batch(line.split.parentId)}>batch #{line.split.parentId.toString()}</a> (
            {formatQuantity(line.split.amount, batch.unit)})
          </p>
        ))}
      {hasDocument(line) && <DocumentRow line={line} verification={verification} />}
      {developer && (
        <p className="ketenregel">
          <a href={href.keten(line.blockNumber)}>Blok #{line.blockNumber}</a>
          <span>
            transactie <HashValue value={line.txHash} />
          </span>
          <span>event #{line.logIndex}</span>
        </p>
      )}
    </li>
  );
}

function DocumentRow({ line, verification }: { line: Line; verification?: Verification }) {
  const name =
    verification && (verification.state === "ok" || verification.state === "afwijkend")
      ? verification.name
      : fileNameFromUri(line.documentURI);
  return (
    <div className="document">
      <span className="document-naam">{name}</span>
      <VerificationBadge verification={verification ?? { state: "controleren" }} />
      <a href={line.documentURI} target="_blank" rel="noreferrer">
        Openen<span className="sr"> ({name}, nieuw venster)</span>
      </a>
      <details>
        <summary>Hash</summary>
        <dl className="hashes">
          <dt>Op de keten</dt>
          <dd>
            <HashValue value={line.documentHash} />
          </dd>
          {verification?.state === "afwijkend" && (
            <>
              <dt>Document nu</dt>
              <dd>
                <HashValue value={verification.actualHash} />
              </dd>
            </>
          )}
        </dl>
      </details>
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div aria-busy="true" aria-label="Batch laden">
      <Skeleton width="8rem" />
      <Skeleton width="22rem" height="2rem" />
      <div className="kenmerken">
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton key={i} width="16rem" />
        ))}
      </div>
      <Skeleton width="100%" height="12rem" />
    </div>
  );
}
