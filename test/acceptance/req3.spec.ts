import { expect, test } from "@playwright/test";
import { readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  ACCOUNT,
  API,
  addCircularity,
  chooseAccount,
  circularitySection,
  circularityValue,
  registerBatch,
  timelineItems,
  timelineUrl,
  transferBatch,
} from "./helpers.js";

const DOCUMENT_DIR = ".demo/documents";

test.describe("Requirement 3: Circulariteits- en milieu-informatie", () => {
  test("Een Manufacturer legt een circulariteitsverklaring vast en de gegevens zijn daarna terug te lezen", async ({ page }) => {
    // Given a Manufacturer with a new batch
    await chooseAccount(page, ACCOUNT.manufacturer);
    const id = await registerBatch(page);

    // When they add a circularity declaration
    await addCircularity(page, id);

    // Then the batch page shows the data, checked against the hash on the chain
    await page.goto(`/#/batch/${id}`);
    await expect(circularitySection(page).getByRole("status")).toContainText("komt overeen met de hash op de Chain");
    await expect(circularityValue(page, "Herbruikbaar zoals het is")).toHaveText("80%");
    await expect(circularityValue(page, "Recyclebaar")).toHaveText("95%");
    await expect(circularityValue(page, "Gerecycled aandeel")).toHaveText("30%");
    await expect(circularityValue(page, "Reparatie")).toHaveText("Goed repareerbaar");
    await expect(circularityValue(page, "Restwaarde")).toContainText(/€ 1[.,]500/);
    await expect(circularityValue(page, "CO₂-impact (A1–A3)")).toHaveText("1.2 kg CO₂-eq per kg");
    await expect(circularityValue(page, "Vervolgtoepassingen")).toHaveText("Hergebruik als balk, Hergebruik als steunframe");

    // And the declaration is part of the timeline, with the account that added it
    await page.goto(timelineUrl(id));
    const claim = timelineItems(page).filter({ hasText: "Circulariteitsverklaring" });
    await expect(claim).toHaveCount(1);
    await expect(claim).toContainText(ACCOUNT.manufacturer.name);
  });

  test("Een batch zonder circulariteitsgegevens zegt dat er nog niets is toegevoegd", async ({ page }) => {
    // Given a new batch without a declaration
    await chooseAccount(page, ACCOUNT.manufacturer);
    const id = await registerBatch(page);

    // When I open the batch
    await page.goto(`/#/batch/${id}`);

    // Then the page says so, instead of showing empty or made-up values
    await expect(circularitySection(page)).toContainText("Er is nog geen circulariteits- of milieu-informatie aan deze batch toegevoegd.");
    await expect(circularitySection(page).locator("dl")).toHaveCount(0);
  });

  test("Een verklaring met ontbrekende of onmogelijke waarden wordt geweigerd", async ({ page }) => {
    // Given the empty circularity form
    await chooseAccount(page, ACCOUNT.manufacturer);
    const id = await registerBatch(page);
    await page.goto("/");
    await page.goto(`/#/batch/${id}/circularity`);

    // When I try to add it
    await page.getByRole("button", { name: "Verklaring toevoegen" }).click();

    // Then every missing field gets a message and nothing is added
    await expect(page.getByText("Voer een getal van 0 tot 100 in.")).toHaveCount(3);
    await expect(page.getByText("Voer een bedrag van 0 of meer in.")).toBeVisible();
    await expect(page.getByText("Voer een getal van 0 of meer in.")).toBeVisible();
    await expect(page.getByText("Voer minstens één mogelijke vervolgtoepassing in.")).toBeVisible();
    await expect(page.getByRole("heading", { name: /toegevoegd aan batch/ })).toHaveCount(0);

    // And a percentage above 100 is refused as well
    await page.getByLabel("Herbruikbaar zoals het is").fill("150");
    await page.getByLabel("Recyclebaar").fill("95");
    await page.getByLabel("Gerecycled aandeel").fill("30");
    await page.getByLabel("Restwaarde van de batch").fill("1500");
    await page.getByLabel("CO₂-impact").fill("1.2");
    await page.getByLabel("Mogelijke vervolgtoepassingen").fill("Hergebruik als balk");
    await page.getByRole("button", { name: "Verklaring toevoegen" }).click();
    await expect(page.getByText("Voer een getal van 0 tot 100 in.")).toHaveCount(1);
    await expect(page.getByRole("heading", { name: /toegevoegd aan batch/ })).toHaveCount(0);

    // And the batch still has no declaration
    await page.goto(`/#/batch/${id}`);
    await expect(circularitySection(page)).toContainText("Er is nog geen circulariteits- of milieu-informatie");
  });

  test("De Demolisher kan de gegevens bijwerken, de nieuwste verklaring wordt getoond en de oude blijft op de tijdlijn", async ({ page }) => {
    // Given a batch with a declaration of the Manufacturer, that is passed on to the Demolisher
    await chooseAccount(page, ACCOUNT.manufacturer);
    const id = await registerBatch(page);
    await addCircularity(page, id, { reusable: "80" });
    await transferBatch(page, id, ACCOUNT.demolisher);

    // When the Demolisher adds a new declaration after assessing the material
    await chooseAccount(page, ACCOUNT.demolisher);
    await addCircularity(page, id, { reusable: "40", repairability: "Beperkt repareerbaar" });

    // Then the batch page shows the newest values
    await page.goto(`/#/batch/${id}`);
    await expect(circularityValue(page, "Herbruikbaar zoals het is")).toHaveText("40%");
    await expect(circularityValue(page, "Reparatie")).toHaveText("Beperkt repareerbaar");

    // And the timeline keeps both declarations, oldest first
    await page.goto(timelineUrl(id));
    const claims = timelineItems(page).filter({ hasText: "Circulariteitsverklaring" });
    await expect(claims).toHaveCount(2);
    await expect(claims.nth(0)).toContainText(ACCOUNT.manufacturer.name);
    await expect(claims.nth(1)).toContainText(ACCOUNT.demolisher.name);
  });
});
