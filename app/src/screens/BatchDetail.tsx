import { ActionButton, Address, ClaimRoleBadge, HashValue } from "../components/ui";
import { CLAIM_TYPE_LABEL, CLASSIFICATION_LABEL, LEVEL_LABEL, SOURCE_FILE_LABEL, canAddAnyClaim } from "../lib/domain";
import { formatDateTime } from "../lib/format";
import { href, navigate } from "../lib/router";
import { usePassport } from "../state";

/** Screen B: details of a single batch. */
export function BatchDetail({ id }: { id: bigint }) {
  const { snapshot, claims, claimRole, claimRoleOf } = usePassport();

  if (!snapshot) return <p className="muted">Loading...</p>;
  const batch = snapshot.batches.get(id);

  if (!batch) {
    return (
      <div className="empty">
        <h1>Batch #{id.toString()} not found</h1>
        <a className="button" href={href.overview()}>
          Back to the overview
        </a>
      </div>
    );
  }

  const list = snapshot.claims.get(id) ?? [];

  return (
    <>
      <div className="heading-row">
        <h1>Batch #{batch.id.toString()}</h1>
        {claims && (
          <ActionButton permission={canAddAnyClaim(claimRole)} onClick={() => navigate(href.claim(batch.id))} primary>
            Add claim
          </ActionButton>
        )}
      </div>

      <dl className="details">
        <dt>Producer</dt>
        <dd>{batch.producer}</dd>

        <dt>Material type</dt>
        <dd>{batch.materialType}</dd>

        <dt>Classification</dt>
        <dd>{CLASSIFICATION_LABEL[batch.classification]}</dd>

        <dt>Level</dt>
        <dd>{LEVEL_LABEL[batch.level]}</dd>

        <dt>Mass</dt>
        <dd>{batch.mass.toString()} kg</dd>

        <dt>Origin</dt>
        <dd>{batch.origin || <span className="muted">–</span>}</dd>

        <dt>Production date</dt>
        <dd>{formatDateTime(batch.productionDate)}</dd>

        <dt>Source</dt>
        <dd>{SOURCE_FILE_LABEL[batch.sourceFile]}</dd>

        <dt>Current owner</dt>
        <dd>
          <Address value={batch.currentOwner} withRole />
        </dd>

        <dt>Registered on</dt>
        <dd>{formatDateTime(batch.registeredAt)}</dd>
      </dl>

      <section>
        <h2>Claims</h2>
        {!claims ? (
          <p className="muted">No ClaimRegistry is deployed. Restart the demo with npm run demo.</p>
        ) : list.length === 0 ? (
          <p className="muted">No claims for this batch yet.</p>
        ) : (
          <>
            <ol className="timeline" aria-label="Claims, newest first">
              {[...list].reverse().map((claim) => (
                <li key={claim.index}>
                  <p className="line-header">
                    <strong>{CLAIM_TYPE_LABEL[claim.claimType]}</strong>
                    <time dateTime={new Date(Number(claim.timestamp) * 1000).toISOString()}>
                      {formatDateTime(claim.timestamp)}
                    </time>
                    <span className="muted">claim #{claim.index}</span>
                  </p>
                  <p className="line-actor">
                    <span className="muted">by</span> <Address value={claim.submitter} />{" "}
                    <ClaimRoleBadge role={claimRoleOf(claim.submitter)} />
                  </p>
                  <div className="document">
                    <span className="muted">Document hash</span> <HashValue value={claim.documentHash} />
                  </div>
                </li>
              ))}
            </ol>
            <p>
              <a href={href.verify(batch.id)}>Check a document against these claims</a>
            </p>
          </>
        )}
      </section>
    </>
  );
}
