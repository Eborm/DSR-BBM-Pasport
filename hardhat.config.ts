import hardhatToolboxMochaEthersPlugin from "@nomicfoundation/hardhat-toolbox-mocha-ethers";
import { defineConfig } from "hardhat/config";

// `npm run rapport` zet deze variabele; de testresultaten gaan dan als JSON
// naar dat pad in plaats van naar de console.
const rapportUitvoer = process.env.BBM_RAPPORT_UITVOER;

// OpenZeppelin 5 gebruikt de instructie `mcopy`, die pas vanaf EVM-versie
// cancun bestaat. Zonder `evmVersion: "cancun"` compileert het niet.
export default defineConfig({
  plugins: [hardhatToolboxMochaEthersPlugin],
  test: {
    mocha: rapportUitvoer ? { reporter: "json", reporterOptions: { output: rapportUitvoer } } : {},
  },
  solidity: {
    profiles: {
      default: {
        version: "0.8.24",
        settings: {
          evmVersion: "cancun",
        },
      },
      production: {
        version: "0.8.24",
        settings: {
          evmVersion: "cancun",
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
    },
  },
  networks: {
    // Lokale keten voor de demo (`npm run demo`). Begint in 2018, zodat de
    // casus uit SPEC §10 met realistische datums op de tijdlijn komt.
    demo: {
      type: "edr-simulated",
      chainType: "l1",
      initialDate: "2018-03-01T09:00:00Z",
    },
    localhost: {
      type: "http",
      chainType: "l1",
      url: "http://127.0.0.1:8545",
    },
  },
});
