import { CircularityPanel } from "../components/CircularityPanel";
import { ActionButton, Address, HashValue, RoleBadge } from "../components/ui";
import { apiUrl } from "../lib/api";
import {
  CLAIM_TYPE_LABEL,
  CLASSIFICATION_LABEL,
  LEVEL_LABEL,
  SOURCE_FILE_LABEL,
  canAddAnyClaim,
  canAddCircularity,
} from "../lib/domain";
import { formatDateTime } from "../lib/format";
import { href, navigate } from "../lib/router";
import { usePassport } from "../state";

/** Screen B: details of a single batch. */
export function BatchDetail({ id }: { id: bigint }) {
  const { snapshot, role, roleOf } = usePassport();

  if (!snapshot) return <p className="muted">Laden...</p>;
  const batch = snapshot.batches.get(id);

  if (!batch) {
    return (
      <div className="empty">
        <h1>Batch #{id.toString()} niet gevonden</h1>
        <a className="button" href={href.overview()}>
          Terug naar het overzicht
        </a>
      </div>
    );
  }

  const list = snapshot.claims.get(id) ?? [];

  return (
    <>
      <div className="heading-row">
        <h1>Batch #{batch.id.toString()}</h1>
        <ActionButton permission={canAddAnyClaim(role)} onClick={() => navigate(href.claim(batch.id))} primary>
          Claim toevoegen
        </ActionButton>
      </div>

      <dl className="details">
        <dt>Producent</dt>
        <dd>{batch.producer}</dd>

        <dt>Materiaalsoort</dt>
        <dd>{batch.materialType}</dd>

        <dt>Classificatie</dt>
        <dd>{CLASSIFICATION_LABEL[batch.classification]}</dd>

        <dt>Niveau</dt>
        <dd>{LEVEL_LABEL[batch.level]}</dd>

        <dt>Massa</dt>
        <dd>{batch.mass.toString()} kg</dd>

        <dt>Herkomst</dt>
        <dd>{batch.origin || <span className="muted">–</span>}</dd>

        <dt>Productiedatum</dt>
        <dd>{formatDateTime(batch.productionDate)}</dd>

        <dt>Bron</dt>
        <dd>{SOURCE_FILE_LABEL[batch.sourceFile]}</dd>

        <dt>Huidige eigenaar</dt>
        <dd>
          <Address value={batch.currentOwner} withRole />
        </dd>

        <dt>Geregistreerd op</dt>
        <dd>{formatDateTime(batch.registeredAt)}</dd>
      </dl>

      <section>
        <div className="heading-row">
          <h2>Circulariteit en milieu</h2>
          <ActionButton permission={canAddCircularity(role)} onClick={() => navigate(href.circularity(batch.id))}>
            Circulariteitsgegevens toevoegen
          </ActionButton>
        </div>
        <CircularityPanel claims={list} />
      </section>

      <section>
        <h2>Open data</h2>
        <p className="muted">
          Dezelfde gegevens zijn voor andere systemen beschikbaar via de open API (alleen lezen, geen account nodig).
        </p>
        <ul>
          <li>
            <a href={apiUrl.batch(batch.id)}>Batch als JSON</a>
          </li>
          <li>
            <a href={apiUrl.batchJsonLd(batch.id)}>Batch als JSON-LD (schema.org)</a>
          </li>
          <li>
            <a href={apiUrl.claims(batch.id)}>Tijdlijn als JSON</a>
          </li>
          <li>
            <a href={apiUrl.openApi()}>API-beschrijving (OpenAPI 3.1)</a>
          </li>
        </ul>
      </section>

      <section>
        <h2>Claims</h2>
        {list.length === 0 ? (
          <p className="muted">Deze batch heeft nog geen claims.</p>
        ) : (
          <>
            <ol className="timeline" aria-label="Claims, nieuwste eerst">
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
                    <span className="muted">door</span> <Address value={claim.submitter} />{" "}
                    <RoleBadge role={roleOf(claim.submitter)} />
                  </p>
                  <div className="document">
                    <span className="muted">Documenthash</span> <HashValue value={claim.documentHash} />
                  </div>
                </li>
              ))}
            </ol>
            <p>
              <a href={href.verify(batch.id)}>Controleer een document tegen deze claims</a>
            </p>
          </>
        )}
      </section>
    </>
  );
}
