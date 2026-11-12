import js from "@eslint/js";
import globals from "globals";

export default [
  {
    ignores: ["node_modules/**", "release/**", "icons/**"],
  },
  js.configs.recommended,
  {
    // Runtime extension scripts are classic (non-module) scripts.
    files: ["background.js", "content.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "script",
      globals: {
        ...globals.browser,
        ...globals.webextensions,
        chrome: "readonly",
      },
    },
    rules: {
      "no-console": "off",
      "no-unused-vars": [
        "error",
        { args: "none", caughtErrors: "none", varsIgnorePattern: "^_" },
      ],
    },
  },
  {
    files: ["scripts/**/*.mjs", "eslint.config.mjs"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        ...globals.node,
      },
    },
  },
];
