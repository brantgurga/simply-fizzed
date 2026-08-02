import { configDefaults, defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: "./src/test/setup.ts",
    // Playwright owns the e2e directory; keep Vitest out of it.
    exclude: [...configDefaults.exclude, "e2e/**"],
  },
});
