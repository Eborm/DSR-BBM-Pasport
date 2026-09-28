import { toDataURL } from "qrcode";
import { useEffect, useState } from "react";
import type { Batch } from "../lib/domain";
import { formatQuantity } from "../lib/format";
import { Skeleton } from "./ui";

/** Link naar het detailscherm van een batch; ook bruikbaar via het scanscherm. */
export const batchLink = (id: bigint) => `${window.location.origin}${window.location.pathname}#/batch/${id}`;

export function QrCode({ batch }: { batch: Batch }) {
  const [image, setImage] = useState<string>();
  const target = batchLink(batch.id);

  useEffect(() => {
    let cancelled = false;
    toDataURL(target, { width: 360, margin: 2, errorCorrectionLevel: "M" }).then((url) => {
      if (!cancelled) setImage(url);
    });
    return () => {
      cancelled = true;
    };
  }, [target]);

  const print = () => {
    document.body.classList.add("print-label");
    const done = () => {
      document.body.classList.remove("print-label");
      window.removeEventListener("afterprint", done);
    };
    window.addEventListener("afterprint", done);
    window.print();
  };

  return (
    <figure className="qr">
      {image ? (
        <img src={image} alt={`QR-code die verwijst naar batch #${batch.id}`} width={160} height={160} />
      ) : (
        <Skeleton width="160px" height="160px" />
      )}
      <figcaption>Batch #{batch.id.toString()}</figcaption>
      <div className="qr-knoppen">
        <a className={image ? "knop klein" : "knop klein uit"} href={image} download={`bbm-batch-${batch.id}-qr.png`}>
          Downloaden
        </a>
        <button type="button" className="knop klein" onClick={print} disabled={!image}>
          Afdrukken
        </button>
      </div>
      <div className="printlabel" aria-hidden="true">
        {image && <img src={image} alt="" />}
        <p>
          <strong>BBM-paspoort · batch #{batch.id.toString()}</strong>
          <br />
          {batch.materialType}
          <br />
          {formatQuantity(batch.quantity, batch.unit)}
        </p>
      </div>
    </figure>
  );
}
