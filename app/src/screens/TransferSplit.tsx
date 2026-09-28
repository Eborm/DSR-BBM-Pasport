import { isAddress } from "ethers";
import { useEffect, useState, type FormEvent } from "react";
import { Address, ErrorBox, RoleBadges, Skeleton, SubmitButton } from "../components/ui";
import { rolesOf as fetchRoles } from "../lib/chain";
import { canSplit, canTransfer, recipientProblem, type Role } from "../lib/domain";
import { explainError, type Explained } from "../lib/errors";
import { formatQuantity } from "../lib/format";
import { href, navigate } from "../lib/router";
import { usePassport } from "../state";

const OTHER = "anders";

/** Scherm E: overdragen en splitsen, één scherm met twee modi. */
export function TransferSplit({ id, mode }: { id: bigint; mode: "overdragen" | "splitsen" }) {
  const { snapshot, roles, account, deployment, contract, writer, reload, rolesOf } = usePassport();
  const batch = snapshot?.batches.get(id);
  const [choice, setChoice] = useState("");
  const [custom, setCustom] = useState("");
  const [customRoles, setCustomRoles] = useState<Role[] | null>(null);
  const [amount, setAmount] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<Explained | null>(null);

  const recipient = choice === OTHER ? custom.trim() : choice;
  const validRecipient = isAddress(recipient);

  // Rollen van een zelf ingevuld adres ophalen, zodat de waarschuwing vooraf klopt.
  useEffect(() => {
    setCustomRoles(null);
    if (choice !== OTHER || !isAddress(custom.trim())) return;
    let cancelled = false;
    void fetchRoles(contract, custom.trim()).then((found) => !cancelled && setCustomRoles(found));
    return () => {
      cancelled = true;
    };
  }, [choice, custom, contract]);

  useEffect(() => {
    setFailure(null);
    setProblem(null);
  }, [mode]);

  if (!snapshot) return <Skeleton height="20rem" />;
  if (!batch) {
    return (
      <div className="leeg">
        <h1>Batch #{id.toString()} bestaat niet</h1>
        <a className="knop" href={href.overzicht()}>
          Naar het overzicht
        </a>
      </div>
    );
  }

  const isOwner = account?.address.toLowerCase() === batch.owner.toLowerCase();
  const permission = mode === "overdragen" ? canTransfer(roles, isOwner) : canSplit(roles, isOwner, batch.quantity);
  const recipientRoles = choice === OTHER ? customRoles : validRecipient ? rolesOf(recipient) : null;
  const warning = validRecipient && recipientRoles ? recipientProblem(recipientRoles) : undefined;
  const candidates = deployment.accounts.filter((a) => a.address.toLowerCase() !== batch.owner.toLowerCase());
  const recipientName = deployment.accounts.find((a) => a.address === recipient)?.name ?? recipient;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setFailure(null);
    if (!validRecipient) return setProblem("Kies een ontvanger of vul een geldig adres in (0x…).");
    if (mode === "overdragen" && !confirmed) return setProblem("Bevestig de overdracht.");
    if (mode === "splitsen") {
      if (!/^\d+$/.test(amount) || BigInt(amount) === 0n || BigInt(amount) >= batch!.quantity) {
        return setProblem(`Vul een aantal in van 1 tot en met ${batch!.quantity - 1n}.`);
      }
    }
    setProblem(null);
    setPending(true);
    try {
      const passport = await writer();
      if (mode === "overdragen") {
        await (await passport.transferOwnership(id, recipient, batch!.quantity)).wait();
        await reload();
        navigate(href.batch(id));
      } else {
        const tx = await passport.splitBatch(id, BigInt(amount), recipient);
        const receipt = await tx.wait();
        const split = receipt?.logs
          .map((log) => contract.interface.parseLog(log))
          .find((parsed) => parsed?.name === "BatchSplit");
        await reload();
        navigate(href.batch(split ? (split.args.childId as bigint) : id));
      }
    } catch (error) {
      setFailure(explainError(error));
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="formulier" onSubmit={submit} noValidate>
      <p className="bovenschrift">
        <a href={href.batch(id)}>← Batch #{id.toString()}</a> · {batch.materialType} ·{" "}
        {formatQuantity(batch.quantity, batch.unit)}
      </p>
      <h1>{mode === "overdragen" ? "Eigendom overdragen" : "Batch splitsen"}</h1>

      <nav className="segmenten" aria-label="Handeling">
        <a href={href.overdragen(id)} aria-current={mode === "overdragen" ? "page" : undefined}>
          Overdragen
        </a>
        <a href={href.splitsen(id)} aria-current={mode === "splitsen" ? "page" : undefined}>
          Splitsen
        </a>
      </nav>

      {!permission.allowed && (
        <p className="reden blok" role="note">
          {permission.reason}
        </p>
      )}

      <fieldset disabled={!permission.allowed || pending}>
        <p>
          Huidige eigenaar: <Address value={batch.owner} withRoles />
        </p>

        {mode === "splitsen" && (
          <label className="veld smal">
            <span>Aantal dat meegaat *</span>
            <input inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.trim())} />
            <span className="hulp">
              1 tot en met {(batch.quantity - 1n).toString()} {batch.unit}
            </span>
          </label>
        )}

        <label className="veld">
          <span>Ontvanger *</span>
          <select value={choice} onChange={(e) => setChoice(e.target.value)}>
            <option value="">Kies…</option>
            {candidates.map((a) => (
              <option key={a.address} value={a.address}>
                {a.name} ({a.toelichting})
              </option>
            ))}
            <option value={OTHER}>Ander adres…</option>
          </select>
        </label>
        {choice === OTHER && (
          <label className="veld">
            <span>Adres van de ontvanger</span>
            <input value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="0x…" spellCheck={false} />
          </label>
        )}
        {validRecipient && recipientRoles && (
          <p>
            Rollen van de ontvanger: <RoleBadges roles={recipientRoles} />
          </p>
        )}
        {warning && (
          <p className="waarschuwing" role="note">
            <span aria-hidden="true">⚠ </span>
            {warning} Het contract zal dit weigeren.
          </p>
        )}

        {mode === "splitsen" && (
          <p className="waarschuwing" role="note">
            <span aria-hidden="true">ℹ </span>
            Er ontstaat een <strong>nieuwe batch</strong> die via "afgesplitst uit" naar batch #{id.toString()} verwijst. De
            historie tot nu toe blijft voor beide batches geldig.
          </p>
        )}

        {mode === "overdragen" && (
          <label className="keuze bevestig">
            <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
            Ik bevestig dat alle {formatQuantity(batch.quantity, batch.unit)} van batch #{id.toString()} overgaan naar{" "}
            {validRecipient ? recipientName : "de gekozen ontvanger"}.
          </label>
        )}
      </fieldset>

      {problem && (
        <p className="veldfout" role="alert">
          {problem}
        </p>
      )}
      {failure && <ErrorBox error={failure} />}

      <div className="knoppen">
        <SubmitButton pending={pending} disabled={!permission.allowed}>
          {mode === "overdragen" ? "Overdragen" : "Splitsen"}
        </SubmitButton>
        <a className="knop" href={href.batch(id)}>
          Annuleren
        </a>
      </div>
    </form>
  );
}
