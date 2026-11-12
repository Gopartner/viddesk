#!/usr/bin/env node
/**
 * Generates the extension icons (PNG) plus a matching SVG source.
 *
 * The artwork mirrors the in-page window chrome: a rounded gradient square
 * (#2b88d8 -> #0067c0) with a white "V" mark.
 *
 * Run with: npm run icons
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { encodePng } from "./lib/binary.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = resolve(ROOT, "icons");

const SIZES = [16, 32, 48, 128];
const SUPERSAMPLE = 4;

const GRADIENT_TOP = [0x2b, 0x88, 0xd8];
const GRADIENT_BOTTOM = [0x00, 0x67, 0xc0];

const MARK = {
  left: [0.3, 0.29],
  tip: [0.5, 0.72],
  right: [0.7, 0.29],
  thickness: 0.135,
};

const CORNER_RADIUS = 0.22;

function distanceToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSquared = dx * dx + dy * dy;
  const t =
    lengthSquared === 0
      ? 0
      : Math.max(
          0,
          Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSquared)
        );
  const x = ax + t * dx;
  const y = ay + t * dy;

  return Math.hypot(px - x, py - y);
}

function insideRoundedRect(x, y, size, radius) {
  if (x < 0 || y < 0 || x > size || y > size) return false;

  const nearLeft = x < radius;
  const nearRight = x > size - radius;
  const nearTop = y < radius;
  const nearBottom = y > size - radius;

  if ((nearLeft || nearRight) && (nearTop || nearBottom)) {
    const cx = nearLeft ? radius : size - radius;
    const cy = nearTop ? radius : size - radius;

    return Math.hypot(x - cx, y - cy) <= radius;
  }

  return true;
}

function insideMark(u, v) {
  const half = MARK.thickness / 2;

  return (
    distanceToSegment(
      u,
      v,
      MARK.left[0],
      MARK.left[1],
      MARK.tip[0],
      MARK.tip[1]
    ) <= half ||
    distanceToSegment(
      u,
      v,
      MARK.tip[0],
      MARK.tip[1],
      MARK.right[0],
      MARK.right[1]
    ) <= half
  );
}

function renderIcon(size) {
  const pixels = size * SUPERSAMPLE;
  const radius = CORNER_RADIUS * pixels;
  const rgba = Buffer.alloc(size * size * 4);
  const samples = SUPERSAMPLE * SUPERSAMPLE;

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let sumR = 0;
      let sumG = 0;
      let sumB = 0;
      let sumA = 0;

      for (let sy = 0; sy < SUPERSAMPLE; sy += 1) {
        for (let sx = 0; sx < SUPERSAMPLE; sx += 1) {
          const px = x * SUPERSAMPLE + sx + 0.5;
          const py = y * SUPERSAMPLE + sy + 0.5;

          if (!insideRoundedRect(px, py, pixels, radius)) continue;

          const u = px / pixels;
          const v = py / pixels;
          const mix = Math.min(1, Math.max(0, v));

          let r = Math.round(
            GRADIENT_TOP[0] + (GRADIENT_BOTTOM[0] - GRADIENT_TOP[0]) * mix
          );
          let g = Math.round(
            GRADIENT_TOP[1] + (GRADIENT_BOTTOM[1] - GRADIENT_TOP[1]) * mix
          );
          let b = Math.round(
            GRADIENT_TOP[2] + (GRADIENT_BOTTOM[2] - GRADIENT_TOP[2]) * mix
          );

          if (insideMark(u, v)) {
            r = 255;
            g = 255;
            b = 255;
          }

          sumR += r;
          sumG += g;
          sumB += b;
          sumA += 1;
        }
      }

      const index = (y * size + x) * 4;

      if (sumA === 0) {
        rgba[index] = 0;
        rgba[index + 1] = 0;
        rgba[index + 2] = 0;
        rgba[index + 3] = 0;
        continue;
      }

      rgba[index] = Math.round(sumR / sumA);
      rgba[index + 1] = Math.round(sumG / sumA);
      rgba[index + 2] = Math.round(sumB / sumA);
      rgba[index + 3] = Math.round((sumA / samples) * 255);
    }
  }

  return encodePng(rgba, size, size);
}

function buildSvg() {
  const scale = 128;
  const point = ([x, y]) =>
    `${(x * scale).toFixed(2)} ${(y * scale).toFixed(2)}`;
  const stroke = (MARK.thickness * scale).toFixed(2);

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${scale} ${scale}" width="${scale}" height="${scale}" role="img" aria-label="VIDGET">
  <defs>
    <linearGradient id="vidget-bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#2b88d8"/>
      <stop offset="1" stop-color="#0067c0"/>
    </linearGradient>
  </defs>
  <rect width="${scale}" height="${scale}" rx="${(CORNER_RADIUS * scale).toFixed(2)}" fill="url(#vidget-bg)"/>
  <path d="M${point(MARK.left)} L${point(MARK.tip)} L${point(MARK.right)}" fill="none" stroke="#ffffff" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
`;
}

mkdirSync(OUT_DIR, { recursive: true });

SIZES.forEach((size) => {
  const file = resolve(OUT_DIR, `icon${size}.png`);
  writeFileSync(file, renderIcon(size));
  console.log(`icon${size}.png`);
});

writeFileSync(resolve(OUT_DIR, "icon.svg"), buildSvg());
console.log("icon.svg");
