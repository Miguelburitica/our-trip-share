import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    include: ["src/**/*.test.ts"],
    // Database integration tests run with `npm run test:db`.
    exclude: ["src/**/*.db.test.ts", "node_modules/**"],
    environment: "node",
  },
});
