import { useId, useState, type ReactNode } from "react";
import { ROLE_LABEL, type Permission, type Role } from "../lib/domain";
import type { Explained } from "../lib/errors";
import { shortAddress, shortHash } from "../lib/format";
import { usePassport } from "../state";

// ------------------------------------------------ Addresses and hashes (§7)

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
      // Clipboard not available; the full value is still in the tooltip.
    }
  };
  return (
    <span className={wrap ? "copyable full" : "copyable"}>
      <code title={value}>{short}</code>
      <button type="button" className="copy" onClick={copy} aria-label={`${label} kopiëren`} title={`${label} kopiëren`}>
        {copied ? <span aria-hidden="true">✓</span> : <CopyIcon />}
      </button>
      <span className="sr" aria-live="polite">
        {copied ? `${label} gekopieerd` : ""}
      </span>
    </span>
  );
}

export function Address({ value, withRole = false }: { value: string; withRole?: boolean }) {
  const { nameOf, roleOf } = usePassport();
  const name = nameOf(value);
  const role = roleOf(value);
  return (
    <span className="address">
      {name && <span className="address-name">{name}</span>}
      <Copyable value={value} short={shortAddress(value)} label="adres" />
      {withRole && <RoleBadge role={role} />}
    </span>
  );
}

/** Shortened with a tooltip, or `full` if the hash itself is the point (step 2 of a claim). */
export function HashValue({ value, full = false }: { value: string; full?: boolean }) {
  return <Copyable value={value} short={full ? value : shortHash(value)} label="hash" wrap={full} />;
}

export function RoleBadge({ role, empty = "geen rol" }: { role: Role | undefined; empty?: string }) {
  if (role === undefined) return <span className="role none">{empty}</span>;
  return <span className="role">{ROLE_LABEL[role]}</span>;
}

/** Message for functionality that is not yet in the contract. */
export function NotImplemented({ what }: { what: string }) {
  return (
    <div className="empty">
      <h1>{what}</h1>
      <p>Deze functionaliteit zit nog niet in het contract. Dit volgt in een latere versie.</p>
    </div>
  );
}

// ------------------------------------------------------------------ Buttons

/** An action that stays visible even when the role doesn't allow it, with the reason underneath (§6.1). */
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
    <div className="action">
      <button
        type="button"
        className={primary ? "button primary" : "button"}
        disabled={!permission.allowed}
        aria-describedby={permission.allowed ? undefined : reasonId}
        onClick={onClick}
      >
        {children}
      </button>
      {!permission.allowed && (
        <p className="reason" id={reasonId}>
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
  pendingLabel = "Transactie wordt uitgevoerd…",
}: {
  pending: boolean;
  disabled?: boolean;
  children: ReactNode;
  pendingLabel?: string;
}) {
  return (
    <button type="submit" className="button primary" disabled={pending || disabled} aria-busy={pending}>
      {pending ? (
        <>
          <span className="progress" aria-hidden="true" />
          {pendingLabel}
        </>
      ) : (
        children
      )}
    </button>
  );
}

// ------------------------------------------------------------ Notifications

export function ErrorBox({ error, title = "Transactie afgewezen" }: { error: Explained; title?: string }) {
  return (
    <div className="error-box" role="alert">
      <p>
        <span aria-hidden="true">⚠ </span>
        <strong>{title}.</strong> {error.message}
      </p>
      {error.technical && (
        <details>
          <summary>Technische details</summary>
          <p className="muted">{error.technical}</p>
        </details>
      )}
    </div>
  );
}

export function Skeleton({ width = "100%", height = "1rem" }: { width?: string; height?: string }) {
  return <span className="skeleton" style={{ width, height }} aria-hidden="true" />;
}

// ------------------------------------------------------------------ Steps

export type StepState = "waiting" | "busy" | "done" | "failed";

export interface Step {
  title: string;
  state: StepState;
  detail?: ReactNode;
}

const STEP_LABEL: Record<StepState, string> = { waiting: "wachten", busy: "bezig…", done: "voltooid", failed: "mislukt" };
const STEP_ICON: Record<StepState, string> = { waiting: "", busy: "…", done: "✓", failed: "!" };

/** Makes the order save → hash → transaction visible (§6.2 D). */
export function Steps({ steps }: { steps: Step[] }) {
  return (
    <ol className="steps">
      {steps.map((step, index) => (
        <li key={step.title} className={`step step-${step.state}`}>
          <span className="step-mark" aria-hidden="true">
            {STEP_ICON[step.state] || index + 1}
          </span>
          <div>
            <p className="step-title">
              {step.title} <span className="step-status">({STEP_LABEL[step.state]})</span>
            </p>
            {step.detail}
          </div>
        </li>
      ))}
    </ol>
  );
}
