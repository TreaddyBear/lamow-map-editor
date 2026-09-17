import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import { vegetationLibraryPlugin } from "./scripts/vegetation-library.mjs";
import { fileURLToPath } from "node:url";
import { gameMapsPlugin } from "./scripts/game-maps.mjs";

export default defineConfig(({ mode }) => ({
  plugins: [tailwindcss(), vegetationLibraryPlugin(fileURLToPath(new URL(mode === "e2e" ? "./.tmp/e2e-vegetation-library/" : "./assets/vegetation/", import.meta.url))), gameMapsPlugin(mode === "e2e" ? fileURLToPath(new URL("./.tmp/e2e-game/", import.meta.url)) : process.env.LAMOW_PROJECT_DIR ?? fileURLToPath(new URL("../LaMow/", import.meta.url)))],
  server: { watch: { ignored: ["**/assets/vegetation/**", "**/.tmp/**"] } },
}));
