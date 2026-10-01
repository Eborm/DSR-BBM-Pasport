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
  server: { port: 5173, strictPort: true, fs: { allow: [project] } },
  build: { outDir: fileURLToPath(new URL("../dist/app", import.meta.url)), emptyOutDir: true },
});
