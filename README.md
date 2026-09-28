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

Generate the test report per requirement (`rapport/toetsingsrapport.html`):
```bash
npm run rapport
```

## Running the demo app

```bash
npm run demo
```

This starts everything in one terminal and resets it on every start:

1. a local chain whose clock starts on 1 March 2018 (port 8545)
2. the document storage (port 8787)
3. the contract, with the case from SPEC §10 on it: steel beams from a donor building in Heerlen, registered in 2018, dismantled and re-inspected in 2044, then split
4. the web app on http://localhost:5173

Stop with Ctrl+C. Logs of the chain and storage are in `.demo/`.

### Demo script

| Step | Wallet (top right) | What to show |
|---|---|---|
| 1 | Geen wallet | Overview: search "staal", filter on status *Beschikbaar*. Everything is readable; every write action is disabled with the reason. |
| 2 | Geen wallet | Batch #1: timeline 2018–2044. Every document is re-hashed on opening: green check. |
| 3 | Keuringsinstituut Limburg | Batch #1 → *Claim toevoegen*: only *Keuring* is selectable. Upload any file and watch upload → hash → transaction. Both inspections stay on the timeline. |
| 4 | Bouwbedrijf Heerlen | Batch #1 → *Eigendom overdragen* to the Keuringsinstituut: the contract refuses and the app explains why in plain language. |
| 5 | Bouwbedrijf Heerlen | *Splitsen*: 20 beams to Architectenbureau Maastricht. The new batch shows the shared history up to the split. |
| 6 | Staalfabriek Zuid-Limburg | *Nieuwe batch registreren*: the result shows the ID and the QR code to put on the material. |
| 7 | any | In a second terminal: `npm run demo:vervals`. Changes one byte in the inspection report (85% → 95%). Open batch #1 again: that document now shows a red warning. |
| 8 | any | *Verifiëren*: upload `demo/documenten/herkeuring-restcapaciteit-2044.pdf` for batch 1 → found. Change one character in a copy → not found. |

The originals of all demo documents are written to `demo/documenten/`.

### Showing that it really runs on a blockchain

Turn on the **Ontwikkelaar** switch in the header. It adds:

- the live block height of the chain in the header;
- the block number, transaction hash and event index on every timeline entry, linked to that block;
- a **Keten** tab: the latest blocks, newest first. Per transaction: who signed it, the decoded function call with its arguments, and the events it emitted. It also checks that every block contains the hash of the block before it.

A convincing sequence:

1. Open the app in two windows (one normal, one private). Turn on *Ontwikkelaar* and open *Keten* in the first window.
2. In the second window, as Keuringsinstituut Limburg, add a claim with a description the audience makes up.
3. Within a second, the first window shows a new block with that exact text in the decoded `addClaim` call, without reloading.
4. Follow the block link from the timeline entry of that claim: it opens the same block.
5. Optional: `Get-Content .demo\keten.log -Wait` shows the same transaction as logged by the chain node. Stop the demo (Ctrl+C) and the app reports that it has lost its connection to the chain.

Refused actions never appear in *Keten*: the contract rejects them before they reach a block.

### Differences from production

- **Wallet**: the demo lets you pick one of the local chain's test accounts, and the local chain signs for them. In production each party signs with its own wallet; the app code only uses a signer, so that is a change of connector, not of design.
- **Document storage**: any document is readable by anyone who knows its URI. The hash on the chain makes tampering visible, not impossible, and access control on documents is not part of the smart contract.
- **Status**: *In gebouw* and *Beschikbaar* follow from the last placement, reuse or demolition claim. The SPEC also mentions *Gesloopt* (not reusable); no event kind distinguishes that yet.
