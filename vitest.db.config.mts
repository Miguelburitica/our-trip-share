import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/** Integration tests against the local Supabase stack (`npx supabase start`, `.env.local`). */
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    include: ["src/**/*.db.test.ts"],
    environment: "node",
    testTimeout: 20_000,
  },
});
