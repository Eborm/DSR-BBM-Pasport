import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const app = fileURLToPath(new URL(".", import.meta.url));
const project = fileURLToPath(new URL("..", import.meta.url));

export default defineConfig({
  root: app,
  plugins: [react()],
  // `fs.allow` lets the app read files outside its own root, such as the
  // project-level deployment artifacts, during development.
  // `/api` goes to the API server (server/api.ts), which also keeps the off-chain documents.
  server: {
    port: 5173,
    strictPort: true,
    fs: { allow: [project] },
    proxy: { "/api": "http://127.0.0.1:8787" },
  },
  build: { outDir: fileURLToPath(new URL("../dist/app", import.meta.url)), emptyOutDir: true },
});
