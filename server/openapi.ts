/**
 * Machine-readable description of the API (requirement 4), served at
 * /api/v1/openapi.json. OpenAPI 3.1 uses JSON Schema 2020-12 for its schemas,
 * so the same schema objects are also served on their own, at
 * /api/v1/schemas/circularity-declaration.json.
 */
import { DECLARATION_SCHEMA, MAX_APPLICATION_LENGTH, MAX_NEXT_APPLICATIONS, REPAIR_LEVELS } from "../app/src/lib/circularity";

const percent = { type: "number", minimum: 0, maximum: 100 };
const hash = { type: "string", pattern: "^0x[0-9a-fA-F]{64}$", description: "keccak256 hash, 0x followed by 64 hex characters." };

/** Keep in sync with validateDeclaration in app/src/lib/circularity.ts. */
export const declarationSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "/api/v1/schemas/circularity-declaration.json",
  title: "Circularity and environmental declaration",
  type: "object",
  additionalProperties: false,
  required: [
    "schema",
    "batchId",
    "reusablePercent",
    "recyclablePercent",
    "repairability",
    "recycledContentPercent",
    "residualValueEur",
    "nextApplications",
    "environment",
  ],
  properties: {
    schema: { const: DECLARATION_SCHEMA },
    batchId: { type: "string", pattern: "^[1-9][0-9]*$" },
    reusablePercent: { ...percent, description: "Share of the mass that can be reused as it is." },
    recyclablePercent: { ...percent, description: "Share of the mass that can be recycled." },
    repairability: { enum: [...REPAIR_LEVELS] },
    recycledContentPercent: { ...percent, description: "Share of secondary raw materials in the batch." },
    residualValueEur: { type: "number", minimum: 0, description: "Estimated residual value of the whole batch, in euro." },
    nextApplications: {
      type: "array",
      minItems: 1,
      maxItems: MAX_NEXT_APPLICATIONS,
      items: { type: "string", minLength: 1, maxLength: MAX_APPLICATION_LENGTH },
    },
    environment: {
      type: "object",
      additionalProperties: false,
      required: ["gwpA1A3KgCo2ePerKg"],
      properties: {
        gwpA1A3KgCo2ePerKg: {
          type: "number",
          minimum: 0,
          description: "GWP-total, modules A1-A3, in kg CO2-eq per kg (the EN 15804+A2 indicator of an EPD).",
        },
        epdHash: hash,
      },
    },
  },
} as const;

// Inside the OpenAPI document the schema is embedded, so it must not set its own base URI.
const { $schema: _schema, $id: _id, ...embeddedDeclarationSchema } = declarationSchema;

const problem = { $ref: "#/components/responses/Problem" };
const idParam = { name: "id", in: "path", required: true, schema: { type: "string", pattern: "^[1-9][0-9]*$" } };
const json = (schema: unknown) => ({ "application/json": { schema } });

export const openApiDocument = {
  openapi: "3.1.0",
  info: {
    title: "BBM-paspoort API",
    version: "1.0.0",
    description:
      "Read access to batches, claims and circularity data of the BBM-paspoort. Reading is open to everyone; " +
      "everything that changes data goes through the smart contract, which checks the role of the sender. " +
      "Dates are ISO 8601 (UTC), masses are in kg, errors follow RFC 9457 (application/problem+json).",
  },
  servers: [{ url: "/" }],
  paths: {
    "/api/v1/batches": {
      get: {
        summary: "List batches",
        parameters: [
          { name: "q", in: "query", schema: { type: "string" }, description: "Search in producer, material type and origin." },
          { name: "level", in: "query", schema: { enum: ["RawMaterial", "Product", "Component", "BuildingElement"] } },
          { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 200, default: 50 } },
          { name: "offset", in: "query", schema: { type: "integer", minimum: 0, default: 0 } },
        ],
        responses: {
          "200": {
            description: "A page of batches",
            content: json({
              type: "object",
              properties: { total: { type: "integer" }, items: { type: "array", items: { $ref: "#/components/schemas/Batch" } } },
            }),
          },
          "400": problem,
        },
      },
    },
    "/api/v1/batches/{id}": {
      get: {
        summary: "One batch (JSON, or JSON-LD with Accept: application/ld+json or ?format=jsonld)",
        parameters: [idParam, { name: "format", in: "query", schema: { enum: ["json", "jsonld"] } }],
        responses: {
          "200": {
            description: "The batch",
            content: { ...json({ $ref: "#/components/schemas/Batch" }), "application/ld+json": { schema: { type: "object" } } },
          },
          "404": problem,
        },
      },
    },
    "/api/v1/batches/{id}/claims": {
      get: {
        summary: "Timeline of a batch: all claims, oldest first",
        parameters: [idParam],
        responses: { "200": { description: "The claims", content: json({ type: "array", items: { $ref: "#/components/schemas/Claim" } }) }, "404": problem },
      },
    },
    "/api/v1/batches/{id}/circularity": {
      get: {
        summary: "Latest circularity and environmental declaration, checked against the hash on the chain",
        parameters: [idParam],
        responses: { "200": { description: "The declaration", content: json({ $ref: "#/components/schemas/CircularityResult" }) }, "404": problem },
      },
    },
    "/api/v1/documents/{hash}": {
      get: {
        summary: "Off-chain document, addressed by its keccak256 hash",
        parameters: [{ name: "hash", in: "path", required: true, schema: hash }],
        responses: { "200": { description: "The raw bytes", content: { "application/octet-stream": { schema: { type: "string", format: "binary" } } } }, "404": problem },
      },
    },
    "/api/v1/documents": {
      post: {
        summary: "Store an off-chain document (max 5 MiB). The hash in the response is the reference to use on the chain.",
        requestBody: { required: true, content: { "application/octet-stream": { schema: { type: "string", format: "binary" } } } },
        responses: {
          "200": { description: "Already stored", content: json({ $ref: "#/components/schemas/StoredDocument" }) },
          "201": { description: "Stored", content: json({ $ref: "#/components/schemas/StoredDocument" }) },
          "413": problem,
        },
      },
    },
    "/api/v1/schemas/circularity-declaration.json": {
      get: { summary: "JSON Schema of a circularity declaration", responses: { "200": { description: "JSON Schema 2020-12" } } },
    },
  },
  components: {
    responses: {
      Problem: { description: "Error (RFC 9457)", content: { "application/problem+json": { schema: { $ref: "#/components/schemas/Problem" } } } },
    },
    schemas: {
      Problem: {
        type: "object",
        required: ["title", "status"],
        properties: { type: { type: "string" }, title: { type: "string" }, status: { type: "integer" }, detail: { type: "string" } },
      },
      Batch: {
        type: "object",
        properties: {
          id: { type: "string" },
          producer: { type: "string" },
          materialType: { type: "string" },
          classification: { enum: ["A1", "A2", "B", "C", "D", "E", "F"] },
          level: { enum: ["RawMaterial", "Product", "Component", "BuildingElement"] },
          mass: { type: "object", properties: { value: { type: "number" }, unit: { const: "kg" } } },
          origin: { type: "string" },
          productionDate: { type: "string", format: "date-time" },
          registeredAt: { type: "string", format: "date-time" },
          currentOwner: { type: "string", description: "Ethereum address" },
          sourceFile: { enum: ["Bim", "InspectionReport", "DemolitionInventory"] },
          links: { type: "object", additionalProperties: { type: "string" } },
        },
      },
      Claim: {
        type: "object",
        properties: {
          index: { type: "integer" },
          type: { enum: ["StatusChange", "LocationChange", "QualityDeclaration", "Registration", "OwnershipTransfer", "CircularityInfo"] },
          submitter: { type: "string", description: "Ethereum address" },
          timestamp: { type: "string", format: "date-time" },
          documentHash: hash,
          documentUrl: { type: "string" },
        },
      },
      StoredDocument: { type: "object", properties: { hash, url: { type: "string" }, size: { type: "integer" } } },
      CircularityResult: {
        type: "object",
        properties: {
          batchId: { type: "string" },
          claimIndex: { type: "integer" },
          submitter: { type: "string" },
          recordedAt: { type: "string", format: "date-time" },
          documentHash: hash,
          verification: { enum: ["verified", "mismatch", "document-missing"], description: "Does the stored document match the hash on the chain?" },
          declaration: { oneOf: [{ $ref: "#/components/schemas/CircularityDeclaration" }, { type: "null" }] },
          problems: { type: "array", items: { type: "string" } },
        },
      },
      CircularityDeclaration: embeddedDeclarationSchema,
    },
  },
} as const;
