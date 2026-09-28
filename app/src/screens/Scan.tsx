import jsQR from "jsqr";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { batchIdFromCode, href, navigate } from "../lib/router";

/** Scherm F: QR-code scannen met de camera, of een batch-ID invoeren. */
export function Scan() {
  const video = useRef<HTMLVideoElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [manual, setManual] = useState("");
  const [manualError, setManualError] = useState<string | null>(null);

  useEffect(() => {
    if (!cameraOn) return;
    let stream: MediaStream | undefined;
    let frame = 0;
    let stopped = false;

    const scan = () => {
      if (stopped) return;
      const v = video.current;
      const c = canvas.current;
      if (v && c && v.readyState === v.HAVE_ENOUGH_DATA) {
        c.width = v.videoWidth;
        c.height = v.videoHeight;
        const context = c.getContext("2d", { willReadFrequently: true })!;
        context.drawImage(v, 0, 0, c.width, c.height);
        const code = jsQR(context.getImageData(0, 0, c.width, c.height).data, c.width, c.height);
        const id = code ? batchIdFromCode(code.data) : undefined;
        if (id !== undefined) {
          navigate(href.batch(id));
          return;
        }
      }
      frame = requestAnimationFrame(scan);
    };

    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "environment" } })
      .then((s) => {
        stream = s;
        if (stopped) return s.getTracks().forEach((t) => t.stop());
        video.current!.srcObject = s;
        void video.current!.play();
        frame = requestAnimationFrame(scan);
      })
      .catch(() => {
        setCameraError("De camera is niet beschikbaar of er is geen toestemming gegeven. Voer het batch-ID hieronder in.");
        setCameraOn(false);
      });

    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [cameraOn]);

  function openManual(event: FormEvent) {
    event.preventDefault();
    const id = batchIdFromCode(manual);
    if (id === undefined || id === 0n) return setManualError("Vul een batch-ID in, bijvoorbeeld 1.");
    navigate(href.batch(id));
  }

  return (
    <div className="formulier">
      <h1>Scannen</h1>
      <section>
        <h2>Met de camera</h2>
        <p className="stil">Richt de camera op de QR-code op het materiaal. Het detailscherm opent vanzelf.</p>
        {cameraOn ? (
          <>
            <video ref={video} className="camera" muted playsInline aria-label="Camerabeeld" />
            <canvas ref={canvas} hidden />
            <div className="knoppen">
              <button type="button" className="knop" onClick={() => setCameraOn(false)}>
                Camera stoppen
              </button>
            </div>
          </>
        ) : (
          <div className="knoppen">
            <button
              type="button"
              className="knop primair"
              onClick={() => {
                setCameraError(null);
                setCameraOn(true);
              }}
            >
              Camera starten
            </button>
          </div>
        )}
        {cameraError && (
          <p className="veldfout" role="alert">
            {cameraError}
          </p>
        )}
      </section>

      <section>
        <h2>Handmatig</h2>
        <form onSubmit={openManual} className="rij onder">
          <label className="veld smal">
            <span>Batch-ID</span>
            <input inputMode="numeric" value={manual} onChange={(e) => setManual(e.target.value)} placeholder="bijv. 1" />
          </label>
          <button type="submit" className="knop primair">
            Openen
          </button>
        </form>
        {manualError && (
          <p className="veldfout" role="alert">
            {manualError}
          </p>
        )}
      </section>
    </div>
  );
}
