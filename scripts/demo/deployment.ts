import path from "node:path";

/** Wat de app nodig heeft om de demo te vinden. Geschreven door demo-data.ts. */
export interface Deployment {
  chainId: number;
  rpcUrl: string;
  storageUrl: string;
  address: string;
  deployBlock: number;
  accounts: { name: string; address: string; toelichting: string }[];
}

export const DEPLOYMENT_FILE = path.resolve("app/public/deployment.json");
export const DEMO_DOCUMENTEN = path.resolve("demo/documenten");
export const STORAGE_URL = process.env.STORAGE_URL ?? "http://localhost:8787";
