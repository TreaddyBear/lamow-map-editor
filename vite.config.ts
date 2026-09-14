import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import { vegetationLibraryPlugin } from "./scripts/vegetation-library.mjs";
import { fileURLToPath } from "node:url";

export default defineConfig(({ mode }) => ({
  plugins: [tailwindcss(), vegetationLibraryPlugin(fileURLToPath(new URL(mode === "e2e" ? "./.tmp/e2e-vegetation-library/" : "./assets/vegetation/", import.meta.url)))],
  server: { watch: { ignored: ["**/assets/vegetation/**", "**/.tmp/**"] } },
}));
