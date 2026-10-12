import { Address, HashValue } from "../components/ui";
import { CLAIM_DOCUMENT_LABEL, CLAIM_TYPE_LABEL } from "../lib/domain";
import { formatDateTime } from "../lib/format";
import { useEffect, useMemo, useState } from "react";
import { loadTransferRecipients } from "../lib/chain";
import { ClaimType } from "../lib/domain";
import { href } from "../lib/router";
import { usePassport } from "../state";

interface OwnerPeriod {
  owner: string;
  since: bigint;
}

export function Timeline({ id }: { id: bigint }) {
  const { snapshot, contract } = usePassport();

  if (!snapshot) return <p className="muted">Laden...</p>;

  const batch = snapshot.batches.get(id);
  const list = snapshot.claims.get(id) ?? [];
  const latestClaim = list[list.length - 1];

  const [recipients, setRecipients] = useState<Map<number, string>>(new Map());
  useEffect(() => {
    loadTransferRecipients(contract, id).then(setRecipients).catch(() => {});
  }, [contract, id, snapshot]);

  const ownerHistory = useMemo(() => {
    const history: OwnerPeriod[] = [];
    for (const claim of list) {
      if (claim.claimType === ClaimType.Registration) {
        history.push({ owner: claim.submitter, since: claim.timestamp });
      } else if (claim.claimType === ClaimType.OwnershipTransfer) {
        const newOwner = recipients.get(claim.index);
        if (newOwner) history.push({ owner: newOwner, since: claim.timestamp });
      }
    }
    return history;
  }, [list, recipients]);

  if (!batch) {
    return (
      <div>
        <h1>Tijdlijn van batch #{id.toString()}</h1>
        <h2>Batch niet gevonden</h2>
        <a href={href.batch(id)}>Terug naar de batch</a>
      </div>
    );
  }

  if (list.length === 0) {
    return (
      <div>
        <h1>Tijdlijn van batch #{id.toString()}</h1>
        <h2>Geen claims gevonden</h2>
        <a href={href.batch(id)}>Terug naar de batch</a>
      </div>
    );
  }

  return (
    <div>
      <h1>Tijdlijn van batch #{id.toString()}</h1>
      <p className="muted">
        {batch.materialType} - {batch.producer}
      </p>

      <dl className="attributes">
        <dt>Huidige eigenaar</dt>
        <dd><Address value={batch.currentOwner} withRole /></dd>
        <dt>Aantal gebeurtenissen</dt>
        <dd>{list.length}</dd>
        <dt>Laatste gebeurtenis</dt>
        <dd>{CLAIM_TYPE_LABEL[latestClaim.claimType]} op {formatDateTime(latestClaim.timestamp)}</dd>
      </dl>

      <h2>Eigendomsgeschiedenis</h2>
      <ol>
        {ownerHistory.map((period, i) => (
          <li key={i}>
            <Address value={period.owner} withRole /> <span className="muted">sinds {formatDateTime(period.since)}</span>
            {i === ownerHistory.length - 1 && <span className="muted"> (huidige eigenaar)</span>}
          </li>
        ))}
      </ol>

      <h2>Tijdlijn</h2>
      <ol className="timeline" aria-label="Tijdlijn, oudste eerst">
        {list.map((claim) => (
          <li key={claim.index.toString()}>
            <p className="line-header">
              <strong>{CLAIM_TYPE_LABEL[claim.claimType]}</strong>
              <time dateTime={new Date(Number(claim.timestamp) * 1000).toISOString()}>
                {formatDateTime(claim.timestamp)}
              </time>
              <span className="muted">claim #{claim.index}</span>
            </p>
            <p className="line-actor">
              <span className="muted">door</span> <Address value={claim.submitter} withRole />
            </p>
            {claim.claimType === ClaimType.OwnershipTransfer && recipients.get(claim.index) && (
              <>
                {" "}
                <span className="muted">aan</span> <Address value={recipients.get(claim.index)!} withRole />
              </>
            )}
            <div className="document">
              <span className="muted">{CLAIM_DOCUMENT_LABEL[claim.claimType] ?? "Documenthash"}</span>{" "}
              <HashValue value={claim.documentHash} />
            </div>
          </li>
        ))}
      </ol>
      <a className="button" href={href.batch(id)}>Terug naar de batch</a>
    </div>
  );
}