import { expect, test } from "@playwright/test";
import { ACCOUNT, addClaim, chooseAccount, ownerHistoryItems, registerBatch, timelineItems, transferBatch, timelineUrl } from "./helpers.js";

test.describe("Requirement 7: Levenscyclus en actualiseerbaarheid", () => {
  test("De tijdlijn groeit mee met de hele levensloop van een batch", async ({ page }) => {
    // Given a batch that goes through production, inspection, sale, placement, resale and demolition
    await chooseAccount(page, ACCOUNT.manufacturer);
    const id = await registerBatch(page);

    await chooseAccount(page, ACCOUNT.inspector);
    await addClaim(page, id, "Kwaliteitsverklaring");

    await chooseAccount(page, ACCOUNT.manufacturer);
    await transferBatch(page, id, ACCOUNT.owner);

    await chooseAccount(page, ACCOUNT.owner);
    await addClaim(page, id, "Locatiewijziging");
    await transferBatch(page, id, ACCOUNT.demolisher);

    await chooseAccount(page, ACCOUNT.demolisher);
    await addClaim(page, id, "Statuswijziging");

    // When I request the timeline
    await page.goto(timelineUrl(id));

    // Then all events are in it, from old to new
    const items = timelineItems(page);
    await expect(items).toHaveCount(6);
    const volgorde = ["Registratie", "Kwaliteitsverklaring", "Eigendom overdracht", "Locatiewijziging", "Eigendom overdracht", "Statuswijziging"];
    for (const [i, soort] of volgorde.entries()) {
      await expect(items.nth(i).locator(".line-header strong")).toHaveText(soort);
    }

    // With, for every event, who did it
    await expect(items.nth(0)).toContainText(ACCOUNT.manufacturer.name);
    await expect(items.nth(1)).toContainText(ACCOUNT.inspector.name);
    await expect(items.nth(5)).toContainText(ACCOUNT.demolisher.name);

    // And for a transfer, to whom the batch went
    await expect(items.nth(2)).toContainText(`aan ${ACCOUNT.owner.name}`);
    await expect(items.nth(4)).toContainText(`aan ${ACCOUNT.demolisher.name}`);

    // And the ownership history matches the current owner
    const eigenaren = ownerHistoryItems(page);
    await expect(eigenaren).toHaveCount(3);
    await expect(eigenaren.nth(0)).toContainText(ACCOUNT.manufacturer.name);
    await expect(eigenaren.nth(1)).toContainText(ACCOUNT.owner.name);
    await expect(eigenaren.nth(2)).toContainText(ACCOUNT.demolisher.name);
    await expect(page.locator("dt:text-is('Huidige eigenaar') + dd")).toContainText(ACCOUNT.demolisher.name);
    await expect(page.locator("dt:text-is('Aantal gebeurtenissen') + dd")).toHaveText("6");
  });

  test("De tijdlijn is te lezen zonder account", async ({ page }) => {
    // Given an existing batch from the demo data and no chosen account
    await chooseAccount(page, null);

    // When I open the timeline
    await page.goto(timelineUrl(1n));

    // Then I see the events, starting with the registration
    await expect(timelineItems(page).first().locator(".line-header strong")).toHaveText("Registratie");
    expect(await timelineItems(page).count()).toBeGreaterThanOrEqual(4);
  });
});
