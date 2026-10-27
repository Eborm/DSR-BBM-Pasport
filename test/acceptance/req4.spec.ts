import { expect, test } from "@playwright/test";
import { keccak256 } from "ethers";
import { ACCOUNT, API, addClaim, chooseAccount, registerBatch, timelineItems, timelineUrl, transferBatch } from "./helpers.js";

test.describe("Requirement 4: Interoperabiliteit en open standaarden", () => {
  test("Alle batches zijn zonder account op te vragen via de open API", async ({ request }) => {
    // When another system asks for the list of batches
    const response = await request.get(`${API}/batches`);

    // Then it gets JSON, which any website may read, with the demo batches in standard units and ISO dates
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("application/json");
    expect(response.headers()["access-control-allow-origin"]).toBe("*");
    const list = await response.json();
    expect(list.total).toBeGreaterThanOrEqual(2);
    const first = list.items.find((batch: any) => batch.id === "1");
    expect(first.producer).toBe("South Limburg Steelworks");
    expect(first.mass).toEqual({ value: 5000, unit: "kg" });
    expect(first.productionDate).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(first.links.self).toBe("/api/v1/batches/1");
  });

  test("Een batch die in de app is geregistreerd staat met dezelfde gegevens in de API", async ({ page, request }) => {
    // Given a batch that is registered in the web app
    await chooseAccount(page, ACCOUNT.manufacturer);
    const id = await registerBatch(page, {
      producer: "Interoperabiliteit BV",
      materialType: "Hout GL24h",
      mass: "2500",
      origin: "Roermond",
      productionDate: "2025-04-10",
    });

    // When another system asks for that batch
    const response = await request.get(`${API}/batches/${id}`);

    // Then the same data comes back
    expect(response.status()).toBe(200);
    const batch = await response.json();
    expect(batch.id).toBe(String(id));
    expect(batch.producer).toBe("Interoperabiliteit BV");
    expect(batch.materialType).toBe("Hout GL24h");
    expect(batch.mass).toEqual({ value: 2500, unit: "kg" });
    expect(batch.origin).toBe("Roermond");
    expect(batch.productionDate).toMatch(/^2025-04-10T/);
    expect(batch.sourceFile).toBe("Bim");
  });

  test("Een batch is ook beschikbaar als JSON-LD volgens schema.org", async ({ request }) => {
    // When another system asks for batch 1 as linked data, with the Accept header
    const byHeader = await request.get(`${API}/batches/1`, { headers: { Accept: "application/ld+json" } });

    // Then it gets a schema.org Product
    expect(byHeader.status()).toBe(200);
    expect(byHeader.headers()["content-type"]).toContain("application/ld+json");
    const product = await byHeader.json();
    expect(product["@context"]).toBe("https://schema.org");
    expect(product["@type"]).toBe("Product");
    expect(product.identifier).toBe("1");
    expect(product.manufacturer).toEqual({ "@type": "Organization", name: "South Limburg Steelworks" });
    expect(product.weight).toEqual({ "@type": "QuantitativeValue", value: 5000, unitCode: "KGM" });

    // And the query parameter gives the same document, for systems that cannot set headers
    const byQuery = await request.get(`${API}/batches/1?format=jsonld`);
    expect(await byQuery.json()).toEqual(product);
  });

  test("De tijdlijn van een batch is op te halen als JSON, van oud naar nieuw, en komt overeen met de app", async ({ page, request }) => {
    // Given a batch with a registration, a quality declaration and a transfer
    await chooseAccount(page, ACCOUNT.manufacturer);
    const id = await registerBatch(page);
    await chooseAccount(page, ACCOUNT.inspector);
    await addClaim(page, id, "Kwaliteitsverklaring");
    await chooseAccount(page, ACCOUNT.manufacturer);
    await transferBatch(page, id, ACCOUNT.owner);

    // When another system asks for the timeline
    const response = await request.get(`${API}/batches/${id}/claims`);

    // Then it gets every event, oldest first, each with a type, a time, who did it and a link to the document
    expect(response.status()).toBe(200);
    const claims = await response.json();
    expect(claims.map((claim: any) => claim.type)).toEqual(["Registration", "QualityDeclaration", "OwnershipTransfer"]);
    expect(claims.map((claim: any) => claim.index)).toEqual([0, 1, 2]);
    for (const claim of claims) {
      expect(claim.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(claim.submitter).toMatch(/^0x[0-9a-fA-F]{40}$/);
      expect(claim.documentUrl).toBe(`/api/v1/documents/${claim.documentHash}`);
    }
    const times = claims.map((claim: any) => Date.parse(claim.timestamp));
    expect(times).toEqual([...times].sort((a, b) => a - b));

    // And the web app shows the same number of events
    await page.goto(timelineUrl(id));
    await expect(timelineItems(page)).toHaveCount(claims.length);
  });

  test("Een document wordt onder zijn eigen hash opgeslagen en is daarmee terug te vinden", async ({ request }) => {
    // When another system stores a new document
    const content = Buffer.from(`interoperabiliteit ${Date.now()} ${Math.random()}`);
    const stored = await request.post(`${API}/documents`, { data: content, headers: { "content-type": "application/octet-stream" } });

    // Then the hash it gets back is the keccak256 of the content, which is also what goes on the chain
    expect(stored.status()).toBe(201);
    const { hash, size } = await stored.json();
    expect(hash).toBe(keccak256(content));
    expect(size).toBe(content.length);

    // And storing the same content again changes nothing
    const again = await request.post(`${API}/documents`, { data: content, headers: { "content-type": "application/octet-stream" } });
    expect(again.status()).toBe(200);
    expect((await again.json()).hash).toBe(hash);

    // And the document comes back unchanged
    const back = await request.get(`${API}/documents/${hash}`);
    expect(back.status()).toBe(200);
    expect(Buffer.from(await back.body()).equals(content)).toBe(true);
    expect(back.headers()["content-disposition"]).toBe("attachment");

    // And an empty document, a malformed hash and an unknown hash are each refused with the right status
    const empty = await request.post(`${API}/documents`, { data: Buffer.alloc(0), headers: { "content-type": "application/octet-stream" } });
    expect(empty.status()).toBe(400);
    expect((await request.get(`${API}/documents/geen-hash`)).status()).toBe(400);
    expect((await request.get(`${API}/documents/0x${"0".repeat(64)}`)).status()).toBe(404);
  });

  test("Fouten komen terug als gestandaardiseerde foutmelding (RFC 9457)", async ({ request }) => {
    // When another system makes a request that cannot be answered
    const cases = [
      { url: `${API}/batches/abc`, status: 400 },
      { url: `${API}/batches/999999`, status: 404 },
      { url: `${API}/batches/999999/claims`, status: 404 },
      { url: `${API}/onbekend`, status: 404 },
    ];

    // Then each answer is a problem document with the matching status, title and explanation
    for (const { url, status } of cases) {
      const response = await request.get(url);
      expect(response.status(), url).toBe(status);
      expect(response.headers()["content-type"], url).toContain("application/problem+json");
      const problem = await response.json();
      expect(problem.status, url).toBe(status);
      expect(problem.title, url).toBeTruthy();
      expect(problem.detail, url).toBeTruthy();
    }
  });

  test("De API kan niets op de keten wijzigen, alleen lezen", async ({ request }) => {
    // Given the number of batches before
    const before = (await (await request.get(`${API}/batches`)).json()).total;

    // When another system tries to change or remove data
    for (const method of ["put", "patch", "delete", "post"] as const) {
      const response = await request[method](`${API}/batches/1`, { data: { producer: "Gehackt" } });

      // Then it is refused, and the explanation is a standard problem document
      expect(response.status(), method).toBe(405);
      expect(response.headers()["content-type"], method).toContain("application/problem+json");
    }
    expect((await request.post(`${API}/batches`, { data: { producer: "Gehackt" } })).status()).toBe(405);

    // And nothing has changed
    const batch = await (await request.get(`${API}/batches/1`)).json();
    expect(batch.producer).toBe("South Limburg Steelworks");
    expect((await (await request.get(`${API}/batches`)).json()).total).toBe(before);
  });

  test("De batchpagina verwijst naar de open data en die verwijzingen werken", async ({ page }) => {
    // Given a user without account who opens batch 1
    await chooseAccount(page, null);
    await page.goto("/#/batch/1");

    // When I look at the open data section
    const section = page.locator('section:has(h2:text-is("Open data"))');

    // Then it links to the JSON, the JSON-LD, the timeline and the API description
    const links = [
      { name: "Batch als JSON", type: "application/json" },
      { name: "Batch als JSON-LD (schema.org)", type: "application/ld+json" },
      { name: "Tijdlijn als JSON", type: "application/json" },
      { name: "API-beschrijving (OpenAPI 3.1)", type: "application/json" },
    ];
    for (const { name, type } of links) {
      const href = await section.getByRole("link", { name, exact: true }).getAttribute("href");
      expect(href, name).toMatch(/^\/api\/v1\//);

      // And every link answers with the right type of document
      const response = await page.request.get(href!);
      expect(response.status(), name).toBe(200);
      expect(response.headers()["content-type"], name).toContain(type);
    }
  });
});
