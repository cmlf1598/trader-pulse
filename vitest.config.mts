import { defineConfig } from "vitest/config";

// Lets `npx vitest run` / `npm test` work from the repo root. The frontend's own config
// (jsdom, setup file, `@/*` alias, test env) drives the run.
export default defineConfig({
  test: {
    projects: ["frontend"],
  },
});
