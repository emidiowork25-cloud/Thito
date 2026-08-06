#!/usr/bin/env node
/**
 * Downloads the latin subsets of the interface typefaces into web/public/fonts.
 *
 * Fonts are vendored rather than linked so the hub keeps working on an isolated
 * network — a control room is exactly the place where an outbound font request
 * fails and the whole interface silently falls back to Times.
 *
 * Run once after cloning: node scripts/fetch-fonts.mjs
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '../web/public/fonts');

// Google's CSS API returns woff2 only for a browser UA.
const UA =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const FAMILIES = [
  { name: 'Montserrat', spec: 'Montserrat:wght@500;600;700;800', weights: [500, 600, 700, 800] },
  { name: 'BarlowCondensed', spec: 'Barlow+Condensed:wght@600;700', weights: [600, 700] },
];

async function get(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`${res.status} fetching ${url}`);
  return res;
}

/** Google emits one @font-face per subset per weight; we only want latin. */
function latinFaces(css) {
  const out = [];
  const blocks = css.matchAll(/\/\* (\S+) \*\/\s*@font-face\s*\{([^}]*)\}/g);
  for (const [, subset, body] of blocks) {
    if (subset !== 'latin') continue;
    const weight = body.match(/font-weight:\s*(\d+)/)?.[1];
    const url = body.match(/url\((https:\/\/[^)]+\.woff2)\)/)?.[1];
    if (weight && url) out.push({ weight: Number(weight), url });
  }
  return out;
}

await mkdir(OUT, { recursive: true });

for (const family of FAMILIES) {
  const css = await (
    await get(`https://fonts.googleapis.com/css2?family=${family.spec}&display=swap`)
  ).text();

  const seen = new Set();
  for (const { weight, url } of latinFaces(css)) {
    if (seen.has(weight) || !family.weights.includes(weight)) continue;
    seen.add(weight);
    const buf = Buffer.from(await (await get(url)).arrayBuffer());
    const file = `${family.name}-${weight}.woff2`;
    await writeFile(resolve(OUT, file), buf);
    console.log(`  ${file}  ${Math.round(buf.length / 1024)} KB`);
  }
}

console.log(`\nFonts written to ${OUT}`);
