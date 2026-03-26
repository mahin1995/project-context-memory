import path from "node:path";
import { fileURLToPath } from "node:url";
import js from "@eslint/js";
import tsEslintPlugin from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import globals from "globals";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default [
  {
    ignores: [
      "coverage",
      "dist",
      "node_modules",
      "**/coverage/**",
      "**/dist/**",
      "**/node_modules/**"
    ]
  },
  js.configs.recommended,
  {
    files: ["**/*.ts"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: "./tsconfig.json",
        tsconfigRootDir: __dirname,
        sourceType: "module"
      },
      globals: {
        ...globals.node
      }
    },
    plugins: {
      "@typescript-eslint": tsEslintPlugin
    },
    rules: {
      ...tsEslintPlugin.configs["recommended-type-checked"].rules,
      "@typescript-eslint/consistent-type-imports": [
        "error",
        {
          prefer: "type-imports",
          fixStyle: "inline-type-imports"
        }
      ],
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": [
        "error",
        {
          checksVoidReturn: {
            arguments: false,
            attributes: false
          }
        }
      ]
    }
  }
];
