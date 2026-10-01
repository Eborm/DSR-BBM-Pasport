/**
 * Translates a rejected transaction into plain language. Sven's contract uses
 * require() strings (no custom errors), so ethers.js already returns the text
 * via `reason` or `shortMessage` -- nothing needs to be decoded here.
 */

export interface Explained {
  message: string;
  technical?: string;
}

export function explainError(error: unknown): Explained {
  const e = error as { reason?: string; shortMessage?: string; message?: string; code?: string };

  if (e?.code === "NETWORK_ERROR" || e?.code === "SERVER_ERROR" || /fetch|ECONNREFUSED/i.test(e?.message ?? "")) {
    return { message: "Geen verbinding met de keten. Draait de demo nog?", technical: e?.message };
  }
  if (typeof e?.reason === "string" && e.reason) {
    return { message: e.reason, technical: e.shortMessage };
  }
  if (typeof e?.shortMessage === "string" && e.shortMessage) {
    return { message: e.shortMessage };
  }
  return { message: e?.message ?? "Er ging iets mis.", technical: e?.message };
}
