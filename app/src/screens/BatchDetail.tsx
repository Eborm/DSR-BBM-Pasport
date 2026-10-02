import { Address, NotImplemented } from "../components/ui";
import { CLASSIFICATION_LABEL, LEVEL_LABEL, SOURCE_FILE_LABEL } from "../lib/domain";
import { formatDateTime } from "../lib/format";
import { href } from "../lib/router";
import { usePassport } from "../state";

/** Screen B: details of a single batch. */
export function BatchDetail({ id }: { id: bigint }) {
  const { snapshot } = usePassport();

  if (!snapshot) return <p className="stil">Laden...</p>;
  const batch = snapshot.batches.get(id);

  if (!batch) {
    return (
      <div className="leeg">
        <h1>Batch #{id.toString()} niet gevonden</h1>
        <a className="knop" href={href.overzicht()}>
          Naar het overzicht
        </a>
      </div>
    );
  }

  return (
    <>
      <div className="kop-rij">
        <h1>Batch #{batch.id.toString()}</h1>
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
        <dd>{batch.origin || <span className="stil">–</span>}</dd>

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
        <h2>Historie</h2>
        <NotImplemented what="Tijdlijn" />
      </section>
    </>
  );
}
