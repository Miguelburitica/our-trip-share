import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // DDD dependency rule (docs/ARCHITECTURE.md): the domain depends only on the shared kernel.
  {
    files: ["src/contexts/*/domain/**/*.ts", "src/shared-kernel/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            { group: ["**/application/**", "**/infrastructure/**", "@/composition/**", "@/app/**"], message: "Domain code must not depend on outer layers." },
            { group: ["next", "next/**", "react", "react/**", "@supabase/**"], message: "Domain code must stay framework-free." },
          ],
        },
      ],
    },
  },
  // Contexts never reach into each other; cross-context access goes through ports wired in src/composition.
  ...["trip-membership", "expense-ledger", "settlement"].map((ctx) => ({
    files: [`src/contexts/${ctx}/**/*.ts`],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["trip-membership", "expense-ledger", "settlement"]
                .filter((other) => other !== ctx)
                .map((other) => `@/contexts/${other}/**`),
              message: "Bounded contexts talk through ports, not imports.",
            },
          ],
        },
      ],
    },
  })),
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
