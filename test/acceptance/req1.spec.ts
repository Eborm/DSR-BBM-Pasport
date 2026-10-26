import { expect, test } from "@playwright/test";
import { ACCOUNT, chooseAccount, ownerHistoryItems, registerBatch, transferBatch, timelineUrl } from "./helpers.js";

test.describe("Requirement 1: Unieke identificatie en traceerbaarheid", () => {
  test("Elke geregistreerde batch krijgt een eigen uniek ID en QR-code", async ({ page }) => {
    // Given a Manufacturer
    await chooseAccount(page, ACCOUNT.manufacturer);

    // When they register two batches
    const first = await registerBatch(page, { producer: "Unieke Fabriek Een" });
    await expect(page.getByRole("img", { name: `QR-code met link naar batch #${first}` })).toBeVisible();
    const second = await registerBatch(page, { producer: "Unieke Fabriek Twee" });
    await expect(page.getByRole("img", { name: `QR-code met link naar batch #${second}` })).toBeVisible();

    // Then both batches have a different ID and both can be found in the overview
    expect(second).not.toBe(first);
    await page.goto("/");
    await expect(page.getByRole("link", { name: `#${first}`, exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: `#${second}`, exact: true })).toBeVisible();
  });

  test("Het eigenaarschap van een batch is terug te volgen na een overdracht", async ({ page }) => {
    // Given a batch that goes from the Manufacturer to the Owner
    await chooseAccount(page, ACCOUNT.manufacturer);
    const id = await registerBatch(page);
    await transferBatch(page, id, ACCOUNT.owner);

    // When I open the timeline
    await page.goto(timelineUrl(id));

    // Then I see who the owner was and who it is now
    const history = ownerHistoryItems(page);
    await expect(history).toHaveCount(2);
    await expect(history.nth(0)).toContainText(ACCOUNT.manufacturer.name);
    await expect(history.nth(1)).toContainText(ACCOUNT.owner.name);
    await expect(history.nth(1)).toContainText("huidige eigenaar");
  });
});
