import { useId, useState, type ReactNode } from "react";
import type { Verification } from "../lib/documents";
import { ROLE_LABEL, STATUS_LABEL, type Permission, type Role, type Status } from "../lib/domain";
import type { Explained } from "../lib/errors";
import { shortAddress, shortHash } from "../lib/format";
import { usePassport } from "../state";

// ------------------------------------------------ Adressen en hashes (§7)

function CopyIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false">
      <rect x="5" y="5" width="9" height="9" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M11 3.5V3a1 1 0 0 0-1-1H3a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function Copyable({ value, short, label, wrap = false }: { value: string; short: string; label: string; wrap?: boolean }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Klembord niet beschikbaar; de volledige waarde staat in de tooltip.
    }
  };
  return (
    <span className={wrap ? "kopieerbaar volledig" : "kopieerbaar"}>
      <code title={value}>{short}</code>
      <button type="button" className="kopieer" onClick={copy} aria-label={`Kopieer ${label}`} title={`Kopieer ${label}`}>
        {copied ? <span aria-hidden="true">✓</span> : <CopyIcon />}
      </button>
      <span className="sr" aria-live="polite">
        {copied ? `${label} gekopieerd` : ""}
      </span>
    </span>
  );
}

export function Address({ value, withRoles = false }: { value: string; withRoles?: boolean }) {
  const { nameOf, rolesOf } = usePassport();
  const name = nameOf(value);
  return (
    <span className="adres">
      {name && <span className="adres-naam">{name}</span>}
      <Copyable value={value} short={shortAddress(value)} label="adres" />
      {withRoles && <RoleBadges roles={rolesOf(value)} />}
    </span>
  );
}

/** Afgekort met tooltip, of `full` als de hash zelf het punt is (stap 2 van een claim). */
export function HashValue({ value, full = false }: { value: string; full?: boolean }) {
  return <Copyable value={value} short={full ? value : shortHash(value)} label="hash" wrap={full} />;
}

export function RoleBadges({ roles, empty = "geen rol" }: { roles: Role[]; empty?: string }) {
  if (roles.length === 0) return <span className="rol geen">{empty}</span>;
  return (
    <>
      {roles.map((role) => (
        <span key={role} className="rol">
          {ROLE_LABEL[role]}
        </span>
      ))}
    </>
  );
}

export function StatusBadge({ status }: { status: Status }) {
  return <span className={`status status-${status}`}>{STATUS_LABEL[status]}</span>;
}

// ------------------------------------------------ Verificatiestatus (§6.2)

const VERIFICATION: Record<Verification["state"], { icon: string; text: string; tone: string }> = {
  controleren: { icon: "…", text: "Controleren…", tone: "neutraal" },
  ok: { icon: "✔", text: "Hash klopt", tone: "ok" },
  afwijkend: { icon: "✖", text: "Hash wijkt af: document gewijzigd", tone: "fout" },
  onbereikbaar: { icon: "–", text: "Niet gecontroleerd", tone: "neutraal" },
};

/** Groen, rood en grijs komen alleen hier voor, altijd met icoon en tekst. */
export function VerificationBadge({ verification }: { verification: Verification }) {
  const v = VERIFICATION[verification.state];
  return (
    <span className={`verificatie ${v.tone}`} role="status">
      <span className="verificatie-icoon" aria-hidden="true">
        {v.icon}
      </span>
      {v.text}
      {verification.state === "onbereikbaar" && <span className="stil"> ({verification.reason})</span>}
    </span>
  );
}

// ------------------------------------------------------------------ Knoppen

/** Een handeling die zichtbaar blijft als de rol hem niet toestaat, met de reden eronder (§6.1). */
export function ActionButton({
  permission,
  onClick,
  children,
  primary = false,
}: {
  permission: Permission;
  onClick: () => void;
  children: ReactNode;
  primary?: boolean;
}) {
  const reasonId = useId();
  return (
    <div className="actie">
      <button
        type="button"
        className={primary ? "knop primair" : "knop"}
        disabled={!permission.allowed}
        aria-describedby={permission.allowed ? undefined : reasonId}
        onClick={onClick}
      >
        {children}
      </button>
      {!permission.allowed && (
        <p className="reden" id={reasonId}>
          {permission.reason}
        </p>
      )}
    </div>
  );
}

export function SubmitButton({
  pending,
  disabled = false,
  children,
  pendingLabel = "Transactie in behandeling…",
}: {
  pending: boolean;
  disabled?: boolean;
  children: ReactNode;
  pendingLabel?: string;
}) {
  return (
    <button type="submit" className="knop primair" disabled={pending || disabled} aria-busy={pending}>
      {pending ? (
        <>
          <span className="voortgang" aria-hidden="true" />
          {pendingLabel}
        </>
      ) : (
        children
      )}
    </button>
  );
}

// ------------------------------------------------------------ Meldingen

export function ErrorBox({ error, title = "Transactie geweigerd" }: { error: Explained; title?: string }) {
  return (
    <div className="foutmelding" role="alert">
      <p>
        <span aria-hidden="true">⚠ </span>
        <strong>{title}.</strong> {error.message}
      </p>
      {(error.error || error.technical) && (
        <details>
          <summary>Technische details</summary>
          {error.error && (
            <p>
              Custom error van het contract: <code>{error.error}</code>
            </p>
          )}
          {error.technical && <p className="stil">{error.technical}</p>}
        </details>
      )}
    </div>
  );
}

export function Skeleton({ width = "100%", height = "1rem" }: { width?: string; height?: string }) {
  return <span className="skeleton" style={{ width, height }} aria-hidden="true" />;
}

// ------------------------------------------------------------------ Stappen

export type StepState = "wachten" | "bezig" | "klaar" | "fout";

export interface Step {
  title: string;
  state: StepState;
  detail?: ReactNode;
}

const STEP_LABEL: Record<StepState, string> = { wachten: "wacht", bezig: "bezig…", klaar: "klaar", fout: "mislukt" };
const STEP_ICON: Record<StepState, string> = { wachten: "", bezig: "…", klaar: "✓", fout: "!" };

/** Maakt de volgorde opslaan → hash → transactie zichtbaar (§6.2 D). */
export function Steps({ steps }: { steps: Step[] }) {
  return (
    <ol className="stappen">
      {steps.map((step, index) => (
        <li key={step.title} className={`stap stap-${step.state}`}>
          <span className="stap-teken" aria-hidden="true">
            {STEP_ICON[step.state] || index + 1}
          </span>
          <div>
            <p className="stap-titel">
              {step.title} <span className="stap-status">({STEP_LABEL[step.state]})</span>
            </p>
            {step.detail}
          </div>
        </li>
      ))}
    </ol>
  );
}
