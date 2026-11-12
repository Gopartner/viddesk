#!/usr/bin/env node
/**
 * Packages the extension into release/vidget-<version>.zip containing only
 * the files Chrome needs at runtime.
 *
 * Run with: npm run build
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createZip } from "./lib/binary.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const RELEASE_DIR = resolve(ROOT, "release");

const manifest = JSON.parse(
  readFileSync(resolve(ROOT, "manifest.json"), "utf8")
);

const runtimeFiles = [
  "manifest.json",
  "background.js",
  "content.js",
  "LICENSE",
  ...Object.values(manifest.icons || {}),
];

const entries = runtimeFiles.map((name) => ({
  name,
  data: readFileSync(resolve(ROOT, name)),
}));

const archive = createZip(entries, new Date());
const output = resolve(RELEASE_DIR, `vidget-${manifest.version}.zip`);

mkdirSync(RELEASE_DIR, { recursive: true });
writeFileSync(output, archive);

const kb = (archive.length / 1024).toFixed(1);

console.log(`Packaged ${entries.length} files -> ${output} (${kb} KB)`);
