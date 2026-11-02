import { expect, test } from "@playwright/test";
import { ACCOUNT, chooseAccount, registerBatch } from "./helpers.js";

test.describe("Requirement 2: Gestandaardiseerde materiaal- en productdata", () => {
  test("Een batch met ontbrekende verplichte velden kan niet worden geregistreerd", async ({ page }) => {
    // Given the registration form, completely empty
    await chooseAccount(page, ACCOUNT.manufacturer);
    await page.goto("/#/register");

    // When I try to register
    await page.getByRole("button", { name: "Registreren" }).click();

    // Then I get a message for every missing field and nothing is registered
    await expect(page.getByText("Voer een producent in.")).toBeVisible();
    await expect(page.getByText("Voer een materiaalsoort in.")).toBeVisible();
    await expect(page.getByText("Voer een gehele massa groter dan nul in.")).toBeVisible();
    await expect(page.getByText("Voer een herkomst in.")).toBeVisible();
    await expect(page.getByText("Kies een productiedatum.")).toBeVisible();
    await expect(page.getByText("Kies het bronbestand.")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Batch registreren" })).toBeVisible();
    await expect(page.getByRole("heading", { name: /geregistreerd$/ })).toHaveCount(0);
  });

  test("Een geregistreerde batch legt alle gestandaardiseerde velden vast", async ({ page }) => {
    // Given a Manufacturer who registers a batch
    await chooseAccount(page, ACCOUNT.manufacturer);
    const id = await registerBatch(page, {
      producer: "Veldentest BV",
      materialType: "Beton C30/37",
      mass: "12345",
      origin: "Sittard",
      productionDate: "2025-03-15",
    });

    // When I open the batch
    await page.goto(`/#/batch/${id}`);

    // Then all fields are recorded
    const veld = (naam: string) => page.locator(`dt:text-is("${naam}") + dd`);
    await expect(veld("Producent")).toHaveText("Veldentest BV");
    await expect(veld("Materiaalsoort")).toHaveText("Beton C30/37");
    await expect(veld("Classificatie")).toHaveText("A1");
    await expect(veld("Niveau")).toHaveText("Grondstof");
    await expect(veld("Massa")).toHaveText("12345 kg");
    await expect(veld("Herkomst")).toHaveText("Sittard");
    await expect(veld("Productiedatum")).not.toBeEmpty();
    await expect(veld("Bron")).toHaveText("BIM/IFC model");
    await expect(veld("Huidige eigenaar")).toContainText(ACCOUNT.manufacturer.name);
  });
});
