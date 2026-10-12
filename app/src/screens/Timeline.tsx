import { Address, HashValue } from "../components/ui";
import { CLAIM_DOCUMENT_LABEL, CLAIM_TYPE_LABEL } from "../lib/domain";
import { formatDateTime } from "../lib/format";
import { useEffect, useState } from "react";
import { loadTransferRecipients } from "../lib/chain";
import { ClaimType } from "../lib/domain";
import { href } from "../lib/router";
import { usePassport } from "../state";

export function Timeline({ id }: { id: bigint }) {
const { snapshot, contract } = usePassport();

if (!snapshot) return <p className="muted">Laden...</p>;

const batch = snapshot.batches.get(id);
const list = snapshot.claims.get(id) ?? [];

const [recipients, setRecipients] = useState<Map<number, string>>(new Map());
useEffect(() => {
  loadTransferRecipients(contract, id).then(setRecipients).catch(() => {});
}, [contract, id, snapshot]);

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
        {batch.materialType} · {batch.producer}
      </p>

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
      <a href={href.batch(id)}>Terug naar de batch</a>
    </div>
  );
}