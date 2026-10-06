import js from "@eslint/js"
import tseslint from "typescript-eslint"
import reactHooks from "eslint-plugin-react-hooks"
import reactRefresh from "eslint-plugin-react-refresh"
import prettier from "eslint-config-prettier"

export default tseslint.config(
  // Global ignores
  {
    ignores: [
      "**/dist/**",
      "**/node_modules/**",
      "**/apps/mobile/**",
      "**/apps/api/migrations/**",
      "**/*.mjs",
    ],
  },

  // Base: JS recommended
  js.configs.recommended,

  // TypeScript (api + web)
  ...tseslint.configs.recommended,

  // React hooks + refresh (web only)
  {
    files: ["apps/web/src/**/*.{ts,tsx}"],
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": "warn",
      "react-hooks/set-state-in-effect": "off", // valid pattern: close sidebar on navigation
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
    },
  },

  // API: relax some rules that are noisy in a backend context
  {
    files: ["apps/api/src/**/*.ts"],
    rules: {
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },

  // Web: no-explicit-any downgraded to warn (too many to fix now)
  {
    files: ["apps/web/src/**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },

  // Prettier must be last to disable conflicting rules
  prettier,
)
