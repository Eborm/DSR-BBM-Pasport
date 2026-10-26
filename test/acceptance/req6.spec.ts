import { expect, test } from "@playwright/test";
import { ACCOUNT, addClaim, chooseAccount, document, registerBatch, timelineItems, timelineUrl, transferBatch } from "./helpers.js";

test.describe("Requirement 6: Datagovernance en toegangsrechten", () => {
  test("Een rol die het niet mag, kan geen kwaliteitsverklaring toevoegen en krijgt uitleg", async ({ page }) => {
    // Given a Manufacturer with a batch of their own
    await chooseAccount(page, ACCOUNT.manufacturer);
    const id = await registerBatch(page);

    // When they try to add a quality declaration
    await page.goto(`/#/batch/${id}/claim`);
    await page.getByLabel("Claimtype").selectOption({ label: "Kwaliteitsverklaring" });
    await page.locator('input[type="file"]').setInputFiles(document("keuring"));
    await expect(page.getByText("keccak256")).toBeVisible();

    // Then it is refused, with an explanation of which role is allowed
    await expect(page.getByRole("note")).toContainText("kan alleen worden toegevoegd door: Inspector");
    await expect(page.getByRole("button", { name: "Claim toevoegen" })).toBeDisabled();
  });

  test("Een account zonder rol kan niets registreren, toevoegen of overdragen", async ({ page }) => {
    // Given an existing batch and an account without rights (the administrator only has the role Viewer)
    await chooseAccount(page, ACCOUNT.manufacturer);
    const id = await registerBatch(page);
    await chooseAccount(page, ACCOUNT.admin);

    // Then it cannot register
    await page.goto("/");
    await expect(page.getByRole("button", { name: "Nieuwe batch registreren" })).toBeDisabled();
    await page.goto("/#/register");
    await expect(page.getByRole("note")).toContainText("Alleen een account met de rol Manufacturer kan batches registreren.");
    await expect(page.getByRole("button", { name: "Registreren" })).toBeDisabled();

    // And cannot add a claim
    await page.goto(`/#/batch/${id}`);
    await expect(page.getByRole("button", { name: "Claim toevoegen" })).toBeDisabled();

    // And cannot transfer either
    await page.goto(`/#/batch/${id}/claim`);
    await page.getByLabel("Claimtype").selectOption({ label: "Eigendom overdracht" });
    await expect(page.getByRole("note")).toContainText("Only the current owner of this batch can transfer it.");
    await expect(page.getByRole("button", { name: "Transfer ownership" })).toBeDisabled();
  });

  test("Zonder gekozen account kan er niets worden gedaan", async ({ page }) => {
    // Given that no account is chosen (read only)
    await chooseAccount(page, null);

    // Then registering is not possible, with an explanation
    await page.goto("/");
    await expect(page.getByRole("button", { name: "Nieuwe batch registreren" })).toBeDisabled();
    await expect(page.getByText("Geen account geselecteerd. Kies bovenaan een account om acties uit te voeren.").first()).toBeVisible();

    // But the data can be read
    await expect(page.locator("table tbody tr").first()).toBeVisible();
  });

  test("Alleen de huidige eigenaar kan een batch overdragen", async ({ page }) => {
    // Given a batch of the Manufacturer
    await chooseAccount(page, ACCOUNT.manufacturer);
    const id = await registerBatch(page);

    // When another Owner wants to transfer the batch
    await chooseAccount(page, ACCOUNT.owner);
    await page.goto(`/#/batch/${id}/claim`);
    await page.getByLabel("Claimtype").selectOption({ label: "Eigendom overdracht" });

    // Then it is refused with an explanation
    await expect(page.getByRole("note")).toContainText("Only the current owner of this batch can transfer it.");
    await expect(page.getByRole("button", { name: "Transfer ownership" })).toBeDisabled();
  });

  test("Een vastgelegde claim kan achteraf niet worden gewijzigd of verwijderd", async ({ page }) => {
    // Given a batch with a registration and a quality declaration
    await chooseAccount(page, ACCOUNT.manufacturer);
    const id = await registerBatch(page);
    await chooseAccount(page, ACCOUNT.inspector);
    await addClaim(page, id, "Kwaliteitsverklaring");
    await page.goto(timelineUrl(id));
    await expect(timelineItems(page)).toHaveCount(2);
    const voor = await timelineItems(page).allTextContents();

    // When another event is added later (the transfer to the Owner)
    await chooseAccount(page, ACCOUNT.manufacturer);
    await transferBatch(page, id, ACCOUNT.owner);

    // Then the earlier claims are still unchanged and in the same order, and the new one comes after them
    await page.goto(timelineUrl(id));
    await expect(timelineItems(page)).toHaveCount(3);
    const na = await timelineItems(page).allTextContents();
    expect(na.slice(0, 2)).toEqual(voor);

    // And there is no button to change or delete a claim
    await expect(page.getByRole("button", { name: /wijzig|verwijder|bewerk|delete|edit/i })).toHaveCount(0);
  });
});
