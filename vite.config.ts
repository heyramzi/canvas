import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vitest/config";
import kitConfig from "#kit.config.js";

export default defineConfig({
  plugins: [sveltekit(kitConfig)],
  resolve: {
    // Without the browser condition vitest loads Svelte's server build and mount() throws.
    conditions: ["browser"],
  },
  test: {
    maxWorkers: 3,
    environment: "jsdom",
    include: ["src/**/*.test.ts"],
    // A `?raw` import of a stylesheet reads as empty unless CSS handling is on.
    css: true,
  },
});
