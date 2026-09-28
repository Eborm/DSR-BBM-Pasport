/** Weergave volgens SPEC §7: adressen en hashes afgekort als 0xf39F…2266. */

export const shortAddress = (address: string) => `${address.slice(0, 6)}…${address.slice(-4)}`;
export const shortHash = (hash: string) => `${hash.slice(0, 8)}…${hash.slice(-6)}`;

const DATE = new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const DATE_TIME = new Intl.DateTimeFormat("nl-NL", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "UTC",
});

export const formatDate = (seconds: number | bigint) =>
  Number(seconds) === 0 ? "–" : DATE.format(new Date(Number(seconds) * 1000));
export const formatDateTime = (seconds: number | bigint) => DATE_TIME.format(new Date(Number(seconds) * 1000));

export const formatQuantity = (quantity: bigint, unit: string) =>
  `${Number(quantity).toLocaleString("nl-NL")} ${unit}`;

/** Unix-tijd (seconden) uit een datumveld "2018-02-15"; 0 als leeg. */
export const secondsFromDateInput = (value: string) => (value ? Math.floor(Date.parse(`${value}T00:00:00Z`) / 1000) : 0);
