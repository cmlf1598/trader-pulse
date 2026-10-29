import { defineConfig } from "vitest/config";

// Vite 8 transforms JSX/TSX with Oxc and resolves the `@/*` alias from tsconfig natively,
// so no @vitejs/plugin-react or vite-tsconfig-paths is needed.
export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    env: {
      NEXT_PUBLIC_API_URL: "http://api.test",
      NEXT_PUBLIC_POLL_INTERVAL_MS: "60000",
    },
    clearMocks: true,
    restoreMocks: true,
    unstubGlobals: true,
  },
});
