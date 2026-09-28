import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const app = fileURLToPath(new URL(".", import.meta.url));
const project = fileURLToPath(new URL("..", import.meta.url));

export default defineConfig({
  root: app,
  plugins: [react()],
  // De contracttypes staan in ../types (gegenereerd door `hardhat build`).
  server: { port: 5173, strictPort: true, fs: { allow: [project] } },
  build: { outDir: fileURLToPath(new URL("../dist/app", import.meta.url)), emptyOutDir: true },
});
