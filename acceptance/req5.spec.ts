import { expect, test } from "@playwright/test";
import { ACCOUNT, addClaim, chooseAccount, document, registerBatch, timelineItems, timelineUrl } from "./helpers.js";

// The inspection report and the changed version (one byte different) are part of the demo files.
const RAPPORT = "app/public/demo/inspection-report-batch-1.txt";
const RAPPORT_GEWIJZIGD = "app/public/demo/inspection-report-batch-1bytechange.txt";

test.describe("Requirement 5: Betrouwbaarheid, provenance en integriteit", () => {
  test("Een vastgelegd document wordt herkend, een gewijzigd document niet", async ({ page }) => {
    // Given a quality declaration that was recorded with the inspection report (demo data)
    await page.goto("/#/verify");

    // When I check the same file
    await page.locator('input[type="file"]').setInputFiles(RAPPORT);

    // Then it is found, as a quality declaration with the account that recorded it
    await expect(page.getByText("Dit document is opgenomen in de blockchain.")).toBeVisible();
    await expect(page.locator("ul.recorded")).toContainText("Kwaliteitsverklaring");
    await expect(page.locator("ul.recorded")).toContainText(ACCOUNT.inspector.name);

    // And when one byte has been changed, then it is not found
    await page.locator('input[type="file"]').setInputFiles(RAPPORT_GEWIJZIGD);
    await expect(page.getByText("Geen claim gevonden voor dit document.")).toBeVisible();
    await expect(page.getByText("Dit document is opgenomen in de blockchain.")).toHaveCount(0);
  });

  test("Het brondocument van een nieuwe batch is vastgelegd bij de registratie", async ({ page }) => {
    // Given a batch that was registered with a source document
    await chooseAccount(page, ACCOUNT.manufacturer);
    const bron = document("bim-model");
    const id = await registerBatch(page, {}, bron);

    // When I check that same file
    await page.goto("/#/verify");
    await page.locator('input[type="file"]').setInputFiles(bron);

    // Then it is found as the registration of this batch
    await expect(page.getByText("Dit document is opgenomen in de blockchain.")).toBeVisible();
    await expect(page.locator("ul.recorded")).toContainText("Registratie");
    await expect(page.locator("ul.recorded")).toContainText(`batch #${id}`);
  });

  test("Bij elke verklaring staat wie die wanneer heeft toegevoegd", async ({ page }) => {
    // Given a batch to which the Inspector adds a quality declaration
    await chooseAccount(page, ACCOUNT.manufacturer);
    const id = await registerBatch(page);
    await chooseAccount(page, ACCOUNT.inspector);
    await addClaim(page, id, "Kwaliteitsverklaring");

    // When I open the timeline
    await page.goto(timelineUrl(id));

    // Then the declaration shows who added it, the role and the time
    const verklaring = timelineItems(page).filter({ hasText: "Kwaliteitsverklaring" });
    await expect(verklaring).toHaveCount(1);
    await expect(verklaring).toContainText(ACCOUNT.inspector.name);
    await expect(verklaring).toContainText("Inspector");
    await expect(verklaring.locator("time")).toHaveAttribute("datetime", /^\d{4}-\d{2}-\d{2}T/);
  });
});
