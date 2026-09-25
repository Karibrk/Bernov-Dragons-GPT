import { readdir, mkdir, cp, rm, readFile, writeFile } from 'node:fs/promises';

// Accept existing ASCII release files as well as the canonical Czech spelling.
const RELEASE_RX = /^DEN[IÍ]K_CORE_V(\d+\.\d+\.\d+\.\d+)\.gpt\.html$/;

function parseVersion(version) {
  return version.split('.').map((part) => {
    if (!/^\d+$/.test(part)) throw new Error(`Neplatná část verze: ${part}`);
    return Number(part);
  });
}

function compareVersion(a, b) {
  for (let i = 0; i < 4; i++) {
    const d = a.parts[i] - b.parts[i];
    if (d) return d;
  }
  return a.name.localeCompare(b.name, 'cs');
}

function stripPreviewRuntime(html) {
  return html
    .replace(/<script[^>]*\bid=["']ibScript["'][^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<script[^>]*src=["'][^"']*ibfunctions\.js[^"']*["'][^>]*>\s*<\/script>/gi, '')
    .replace(/<!--[\s\S]*?frame-runtime[\s\S]*?-->/gi, '')
    .replace(/<script>\s*window\.__FRAME_PREAMBLE\s*=[\s\S]*?<\/script>/g, '')
    .replace(/<script>\(function\(\)\{"use strict";function sr\(t\)\{return t==="cookie"[\s\S]*?<\/script>/g, '');
}

function enforceFilenameVersion(html, version) {
  const current = html.match(/window\.DATA\s*=\s*\{"VERSION":"([^"]+)"/);
  if (!current) {
    throw new Error('V HTML chybí window.DATA.VERSION');
  }
  if (current[1] === version) return html;
  console.warn(`DATA.VERSION=${current[1]} nesedí na filename ${version} — opravuji na ${version}`);
  return html.replace(/window\.DATA\s*=\s*\{"VERSION":"[^"]+"/, `window.DATA={"VERSION":"${version}"`);
}

const entries = await readdir('.');
const candidates = entries
  .map((name) => {
    const m = name.match(RELEASE_RX);
    if (!m) return null;
    return { name, version: m[1], parts: parseVersion(m[1]) };
  })
  .filter(Boolean);

if (!candidates.length) {
  throw new Error('Nenalezen žádný DENÍK_CORE_Vx.x.x.x.gpt.html');
}

candidates.sort(compareVersion);
const latest = candidates.at(-1);
const raw = await readFile(latest.name, 'utf8');
const cleaned = stripPreviewRuntime(raw);
const html = enforceFilenameVersion(cleaned, latest.version);

if (!html.includes(`window.DATA={"VERSION":"${latest.version}"`)) {
  throw new Error(`Build odmítl publikovat jinou verzi než ${latest.version}`);
}

/*
 * Kontrolujeme pouze skutečnou HTML injekci.
 * Řetězce "__FRAME_PREAMBLE" a "ibScript" se smějí objevit uvnitř
 * vlastního cleanup kódu deníku a nesmějí způsobit falešné selhání buildu.
 */
const hasInjectedRuntime =
  /<script[^>]*\bid=["']ibScript["'][^>]*>/i.test(html) ||
  /<script[^>]*src=["'][^"']*ibfunctions\.js[^"']*["'][^>]*>/i.test(html) ||
  /<script[^>]*>\s*window\.__FRAME_PREAMBLE\s*=/i.test(html) ||
  /<!--[\s\S]*?frame-runtime[\s\S]*?-->/i.test(html);

if (hasInjectedRuntime) {
  throw new Error('Build našel skutečnou preview/runtime injekci v produkčním HTML');
}

await rm('dist', { recursive: true, force: true });
await mkdir('dist', { recursive: true });
await writeFile('dist/index.html', html, 'utf8');

for (const dir of ['denik-media']) {
  try {
    await cp(dir, `dist/${dir}`, { recursive: true });
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code !== 'ENOENT') {
      throw error;
    }
  }
}

console.log(`Bernov & Dragons: publikuji ${latest.name} jako / (verze ${latest.version})`);
