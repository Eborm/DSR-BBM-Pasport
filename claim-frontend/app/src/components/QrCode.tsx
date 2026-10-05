import { toDataURL } from "qrcode";
import { useEffect, useState } from "react";
import type { Batch } from "../lib/domain";
import { Skeleton } from "./ui";

/** Link to a batch's detail screen; also usable from the scan screen. */
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
        <img src={image} alt={`QR code linking to batch #${batch.id}`} width={160} height={160} />
      ) : (
        <Skeleton width="160px" height="160px" />
      )}
      <figcaption>Batch #{batch.id.toString()}</figcaption>
      <div className="qr-buttons">
        <a className={image ? "button small" : "button small disabled"} href={image} download={`bbm-batch-${batch.id}-qr.png`}>
          Download
        </a>
        <button type="button" className="button small" onClick={print} disabled={!image}>
          Print
        </button>
      </div>
      <div className="printlabel" aria-hidden="true">
        {image && <img src={image} alt="" />}
        <p>
          <strong>BBM passport · batch #{batch.id.toString()}</strong>
          <br />
          {batch.materialType}
          <br />
          {batch.mass.toString()} kg
        </p>
      </div>
    </figure>
  );
}
