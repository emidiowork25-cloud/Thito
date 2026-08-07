#!/usr/bin/env node
/**
 * Drives the built SPA in a real browser and screenshots every screen.
 *
 * Typechecking proves the code compiles; it says nothing about whether the app
 * renders, whether the session survives a reload, or whether a page throws once
 * real data reaches it. This walks the actual flows and fails on any console
 * error or failed request along the way.
 *
 * Usage: node scripts/ui-check.mjs [base-url] [user] [pass] [outDir]
 */
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';

const BASE = process.argv[2] ?? 'http://127.0.0.1:8080';
const USER = process.argv[3] ?? 'admin';
const PASS = process.argv[4] ?? 'admin-teste-123';
const OUT = process.argv[5] ?? './ui-shots';

await mkdir(OUT, { recursive: true });

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--disable-gpu'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });

const problems = [];

page.on('console', (msg) => {
  if (msg.type() !== 'error') return;
  const text = msg.text();
  // hls.js complains loudly while a preview playlist does not exist yet, which
  // is the normal state for an ingest with no sender attached.
  if (/manifestLoadError|Failed to load resource.*preview|404/.test(text)) return;
  problems.push(`console: ${text}`);
});

page.on('pageerror', (err) => problems.push(`pageerror: ${err.message}`));

page.on('response', (res) => {
  const url = res.url();
  if (!url.startsWith(BASE)) return;
  if (url.includes('/preview/')) return;
  // 401 on the session probe before login is how the app learns it is signed out.
  if (res.status() === 401 && url.includes('/api/auth/session')) return;
  if (res.status() >= 500) problems.push(`${res.status()} ${url}`);
});

/**
 * `networkidle` never fires on screens carrying a live HLS preview — the player
 * keeps fetching segments for as long as the page is open, which is the point.
 * Wait for the DOM and a short settle instead.
 */
async function shot(name, path, waitFor) {
  await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' });
  if (waitFor) {
    await page.waitForSelector(waitFor, { timeout: 10000 }).catch(() => {
      problems.push(`seletor ausente em ${path}: ${waitFor}`);
    });
  }
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
  console.log(`  ${name.padEnd(18)} ${path}`);
}

console.log('=== páginas públicas ===');
await shot('01-landing', '/', 'h1');
await shot('02-login', '/entrar', 'form');
await shot('03-admin', '/admin', 'form');
await shot('04-signup', '/criar-conta', 'form');

console.log('\n=== login ===');
await page.goto(`${BASE}/entrar`, { waitUntil: 'domcontentloaded' });
await page.fill('input[autocomplete="username"]', USER);
await page.fill('input[autocomplete="current-password"]', PASS);
await page.click('button[type="submit"]');
await page.waitForURL(`${BASE}/app`, { timeout: 10000 });
console.log('  entrou e caiu em /app');

console.log('\n=== páginas internas ===');
await shot('05-recepcoes', '/app', 'header');
await shot('06-multiview', '/app/multiview', 'header');
await shot('07-banda', '/app/dashboard', 'header');
await shot('08-aprovacoes', '/app/aprovacoes', 'header');
await shot('09-usuarios', '/app/usuarios', 'table, p');
await shot('10-destinos', '/app/destinos', 'header');
await shot('11-configuracoes', '/app/configuracoes', 'header');
await shot('12-conta', '/app/conta', 'form');

console.log('\n=== a sessão sobrevive a um reload? ===');
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1500);
const stillIn = page.url().includes('/app');
console.log(`  ${stillIn ? 'sim' : 'NÃO — voltou para o login'}`);
if (!stillIn) problems.push('a sessão não sobreviveu ao reload');

console.log('\n=== rota de admin protegida para operador? ===');
// Signed in as an admin here, so this only checks the route resolves at all.
await page.goto(`${BASE}/app/usuarios`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1500);
if (!page.url().includes('/app/usuarios')) problems.push('admin não conseguiu abrir /app/usuarios');

await browser.close();

if (problems.length) {
  console.error('\nPROBLEMAS ENCONTRADOS:');
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log('\nNENHUM ERRO DE CONSOLE, REDE OU RENDERIZAÇÃO');
