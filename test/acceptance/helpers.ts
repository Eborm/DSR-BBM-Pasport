import { expect, type Page } from "@playwright/test";

/** The test accounts from scripts/demo-data.ts, with the role they get in the app. */
export const ACCOUNT = {
  admin: { name: "Administrator", role: "Viewer" },
  manufacturer: { name: "South Limburg Steelworks", role: "Manufacturer" },
  inspector: { name: "Limburg Inspection Institute", role: "Inspector" },
  owner: { name: "Heerlen Construction Company", role: "Owner" },
  demolisher: { name: "Parkstad Demolition Company", role: "Demolisher" },
} as const;

type Account = (typeof ACCOUNT)[keyof typeof ACCOUNT];

/** A unique "document": every content gives a different hash, so scenarios do not interfere with each other. */
export function document(name: string) {
  return {
    name: `${name}.txt`,
    mimeType: "text/plain",
    buffer: Buffer.from(`${name} ${Date.now()} ${Math.random()}`),
  };
}

/** Pick an account at the top, like a user does, and wait until the role is known. */
export async function chooseAccount(page: Page, account: Account | null) {
  await page.goto("/");
  const picker = page.locator(".wallet select");
  if (account === null) {
    await picker.selectOption({ value: "" });
    await expect(page.locator(".wallet-status .role")).toHaveCount(0);
    return;
  }
  await picker.selectOption({ label: account.name });
  await expect(page.locator(".wallet-status .role")).toHaveText(account.role);
}

export interface NewBatch {
  producer: string;
  materialType: string;
  mass: string;
  origin: string;
  productionDate: string;
}

export const SAMPLE_BATCH: NewBatch = {
  producer: "Testfabriek Heerlen",
  materialType: "Staal S355, HEA 200",
  mass: "4200",
  origin: "Heerlen",
  productionDate: "2025-06-01",
};

/** Fill in the registration form as a Manufacturer and return the new batch ID. */
export async function registerBatch(page: Page, batch: Partial<NewBatch> = {}, file = document("brondocument")) {
  const data = { ...SAMPLE_BATCH, ...batch };
  await openFresh(page, "/#/register");
  await expect(page.getByRole("heading", { name: "Batch registreren" })).toBeVisible();
  await page.getByLabel("Producent").fill(data.producer);
  await page.getByLabel("Materiaalsoort").fill(data.materialType);
  await page.getByLabel("Massa (kg)").fill(data.mass);
  await page.getByLabel("Herkomst").fill(data.origin);
  await page.getByLabel("Productiedatum").fill(data.productionDate);
  await page.locator('input[type="file"]').setInputFiles(file);
  await expect(page.getByText("keccak256")).toBeVisible();
  await page.getByRole("button", { name: "Registreren" }).click();
  const heading = page.getByRole("heading", { name: /Batch #\d+ geregistreerd/ });
  await expect(heading).toBeVisible();
  const id = (await heading.textContent())!.match(/#(\d+)/)![1];
  return BigInt(id);
}

/** Add a claim to a batch with the chosen account. */
export async function addClaim(page: Page, id: bigint, type: string, file = document("bewijsdocument")) {
  await openFresh(page, `/#/batch/${id}/claim`);
  await expect(page.getByRole("heading", { name: `Claim toevoegen aan batch #${id}` })).toBeVisible();
  await page.getByLabel("Claimtype").selectOption({ label: type });
  await page.locator('input[type="file"]').setInputFiles(file);
  await expect(page.getByText("keccak256")).toBeVisible();
  await page.getByRole("button", { name: "Claim toevoegen" }).click();
  await expect(page.getByRole("heading", { name: new RegExp(`toegevoegd aan batch #${id}$`) })).toBeVisible();
}

/** Transfer a batch to another account, with a transfer document. */
export async function transferBatch(page: Page, id: bigint, to: Account, file = document("overdrachtsdocument")) {
  await openFresh(page, `/#/batch/${id}/claim`);
  await expect(page.getByRole("heading", { name: `Claim toevoegen aan batch #${id}` })).toBeVisible();
  await page.getByLabel("Claimtype").selectOption({ label: "Eigendom overdracht" });
  await page.locator('label.field:has(span:text-is("New owner *")) select').selectOption({ label: `${to.name} (${to.role})` });
  await page.locator('input[type="file"]').setInputFiles(file);
  await expect(page.getByText("keccak256")).toBeVisible();
  await page.getByRole("button", { name: "Transfer ownership" }).click();
  await expect(page.getByText(`was transferred to`)).toBeVisible();
}

/** Address of the timeline page of a batch. */
export const timelineUrl = (id: bigint) => `/#/timeline/${id}`;

/**
 * Go to the overview first. A screen remembers its outcome as long as the address stays the same
 * (for example "batch geregistreerd"), so this way every form starts clean, like for a new user.
 */
async function openFresh(page: Page, hash: string) {
  await page.goto("/");
  await page.goto(hash);
}

export const timelineItems = (page: Page) => page.locator("ol.timeline > li");
export const ownerHistoryItems = (page: Page) => page.locator('h2:has-text("Eigendomsgeschiedenis") + ol > li');
