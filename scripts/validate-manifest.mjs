#!/usr/bin/env node
/**
 * Sanity-checks manifest.json before packaging:
 *  - required MV3 fields exist and the version is valid semver
 *  - every file referenced by the manifest exists on disk
 *  - permissions stay within an allow-list (fails on overly broad access)
 *
 * Run with: npm run validate
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MANIFEST_PATH = resolve(ROOT, "manifest.json");

const ALLOWED_PERMISSIONS = new Set([
  "activeTab",
  "scripting",
  "storage",
  "downloads",
]);
const ALLOWED_HOST_PERMISSIONS = new Set(["http://*/*", "https://*/*"]);
const REQUIRED_ICON_SIZES = ["16", "32", "48", "128"];
const SEMVER = /^\d+\.\d+\.\d+$/;

const errors = [];
const warnings = [];

function fail(message) {
  errors.push(message);
}

function warn(message) {
  warnings.push(message);
}

function checkFile(path, label) {
  if (typeof path !== "string" || path.length === 0) {
    fail(`${label}: path kosong atau bukan string`);
    return;
  }

  if (!existsSync(resolve(ROOT, path))) {
    fail(`${label}: file tidak ditemukan -> ${path}`);
  }
}

let manifest;

try {
  manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));
} catch (error) {
  console.error(`Gagal membaca manifest.json: ${error.message}`);
  process.exit(1);
}

if (manifest.manifest_version !== 3) {
  fail(`manifest_version harus 3 (ditemukan: ${manifest.manifest_version})`);
}

["name", "version", "description"].forEach((key) => {
  if (typeof manifest[key] !== "string" || manifest[key].trim() === "") {
    fail(`field "${key}" wajib diisi`);
  }
});

if (!SEMVER.test(manifest.version || "")) {
  fail(`version harus semver x.y.z (ditemukan: ${manifest.version})`);
}

const pkg = JSON.parse(readFileSync(resolve(ROOT, "package.json"), "utf8"));

if (pkg.version !== manifest.version) {
  fail(
    `versi package.json (${pkg.version}) tidak sama dengan manifest.json (${manifest.version})`
  );
}

["background.js", "content.js"].forEach((file) => checkFile(file, "runtime"));

if (
  !manifest.background ||
  manifest.background.service_worker !== "background.js"
) {
  fail('background.service_worker harus "background.js"');
}

if (!Array.isArray(manifest.permissions)) {
  fail("permissions harus berupa array");
} else {
  manifest.permissions.forEach((permission) => {
    if (!ALLOWED_PERMISSIONS.has(permission)) {
      fail(`permission tidak dikenal/berlebih: "${permission}"`);
    }
  });
}

const hostPermissions = manifest.host_permissions || [];

hostPermissions.forEach((permission) => {
  if (!ALLOWED_HOST_PERMISSIONS.has(permission)) {
    fail(`host_permissions terlalu luas: "${permission}"`);
  }
});

if (hostPermissions.length > 0) {
  warn(
    "host_permissions terpasang. Pastikan memang dibutuhkan; injeksi lewat klik ikon sudah tercakup activeTab."
  );
}

if (!manifest.icons) {
  fail("field icons wajib ada");
} else {
  REQUIRED_ICON_SIZES.forEach((size) =>
    checkFile(manifest.icons[size], `icons.${size}`)
  );
}

const actionIcons = manifest.action && manifest.action.default_icon;

if (!actionIcons) {
  fail("action.default_icon wajib ada");
} else {
  Object.entries(actionIcons).forEach(([size, path]) =>
    checkFile(path, `action.default_icon.${size}`)
  );
}

if (!manifest.action || typeof manifest.action.default_title !== "string") {
  fail("action.default_title wajib diisi");
}

if (manifest.action && manifest.action.default_popup) {
  warn(
    "action.default_popup terpasang: klik ikon tidak akan memicu onClicked."
  );
}

warnings.forEach((message) => console.warn(`WARN  ${message}`));

if (errors.length > 0) {
  errors.forEach((message) => console.error(`ERROR ${message}`));
  console.error(`\n${errors.length} masalah ditemukan.`);
  process.exit(1);
}

console.log(`manifest.json valid — ${manifest.name} v${manifest.version}`);
