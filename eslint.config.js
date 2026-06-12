import js from "@eslint/js";
import globals from "globals";
import { defineConfig } from "eslint/config";
import unusedImports from "eslint-plugin-unused-imports";

export default defineConfig([
  {
    files: ["**/*.{js,mjs,cjs}"],

    plugins: {
      js,
      "unused-imports": unusedImports,
    },

    extends: ["js/recommended"],

    languageOptions: {
      globals: globals.node, // ✅ FIX: backend, not browser
      ecmaVersion: "latest",
      sourceType: "module",
    },

    rules: {
      // ✅ detect unused variables
      "no-unused-vars": "off", // disable default
      "unused-imports/no-unused-vars": [
        "warn",
        {
          vars: "all",
          varsIgnorePattern: "^_",
          args: "after-used",
          argsIgnorePattern: "^_",
        },
      ],

      // ✅ remove unused imports automatically
      "unused-imports/no-unused-imports": "error",
    },
  },
]);