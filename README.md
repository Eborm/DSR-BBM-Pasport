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

## Running acceptance tests

Run test:
```bash
npm run test:acceptance
```

View results:
```bash
npm run test:acceptance:report
```