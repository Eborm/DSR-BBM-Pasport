# DSR-BBM-Pasport
DSR-BBM-Pasport project

## Project setup

### 1. Install Node.js
Download and install Node.js via [nodejs.org](https://nodejs.org) (choose the LTS version). This also installs `npm`.

### 2. open the project folder in VS Code
Go to **File → Open folder** (or Ctrl+K+O) and navigate to where the folder of this repo is located and select the folder.

### 3. Open a terminal
Open a terminal in the project folder:
- In VS Code: **View → Terminal**.

Check that the installation succeeded:
```bash
node --version
```

### 4. Install dependencies
```bash
npm install
```
This uses `package.json` to install all required packages.

> **Note:** if you get an `ERESOLVE` error about a mocha version conflict, change the `"mocha": "^12.0.2"` line in `package.json` to `"mocha": "^11.0.0"` and try again.

## Running the project

Compile the smart contracts:
```bash
npx hardhat compile
```

Run the tests:
```bash
npx hardhat test
```

## Demo, API and open data

Start everything (local chain, demo data, API and web app) with one command:
```bash
npm run demo
```
The web app runs at http://localhost:5173 and the API at http://127.0.0.1:8787/api/v1.

### Circularity and environmental information (requirement 3)
A manufacturer or demolisher adds a circularity declaration to a batch (button on the batch page). The declaration is a JSON document
(reusability, recyclability, recycled content, repairability, residual value, CO₂ impact per EN 15804+A2 and possible next applications).
It is stored off-chain; only its keccak256 hash goes on the chain, as a claim of type `CircularityInfo`. The batch page reads the document
back and checks it against that hash in the browser.

### Open API (requirement 4)
Reading is open to everyone; every change goes through the smart contract. All responses are JSON (dates in ISO 8601, masses in kg, errors
as RFC 9457 `application/problem+json`).

| Endpoint | Returns |
| --- | --- |
| `GET /api/v1/batches?q=&level=&limit=&offset=` | List and search batches |
| `GET /api/v1/batches/{id}` | One batch; JSON-LD (schema.org) with `Accept: application/ld+json` or `?format=jsonld` |
| `GET /api/v1/batches/{id}/claims` | The timeline of a batch |
| `GET /api/v1/batches/{id}/circularity` | Latest circularity declaration, with `verified`, `mismatch` or `document-missing` |
| `GET /api/v1/documents/{hash}` | An off-chain document, addressed by its hash |
| `POST /api/v1/documents` | Store an off-chain document (max 5 MiB); returns its hash |
| `GET /api/v1/openapi.json` | OpenAPI 3.1 description of the API |
| `GET /api/v1/schemas/circularity-declaration.json` | JSON Schema (2020-12) of a declaration |

Try it: `curl http://127.0.0.1:8787/api/v1/batches/1/circularity`

Type check the app and the server with `npm run typecheck`.
