#!/usr/bin/env node

/**
 * Applies the Bernov & Dragons production cleanup safely.
 * Run from the repository root:
 *   node scripts/apply-production-cleanup.mjs
 *
 * The script creates a timestamped backup before changing files, removes the
 * obsolete Jekyll workflow, updates package.json/.env.example, regenerates the
 * lockfile, and runs syntax/build checks.
 */
import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

const root = resolve(new URL('..', import.meta.url).pathname);
const stamp = new Date().toISOString().replace(/[.:]/g, '-');
const backupRoot = join(root, '.cleanup-backups', stamp);

const files = [
  'package.json',
  'package-lock.json',
  '.env.example',
  'api/_web.js',
  'api/_mcp-auth.js',
  'api/mcp.js',
  'api/_state.js',
  'build-latest.mjs',
  '.github/workflows/jekyll-docker.yml',
];

async function exists(path) {
  try { await readFile(path); return true; } catch { return false; }
}

async function backup(path) {
  const source = join(root, path);
  if (!(await exists(source))) return;
  const target = join(backupRoot, path);
  await mkdir(dirname(target), { recursive: true });
  await copyFile(source, target);
}

async function put(path, content) {
  const target = join(root, path);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, content.endsWith('\n') ? content : `${content}\n`, 'utf8');
}

for (const path of files) await backup(path);
await mkdir(backupRoot, { recursive: true });

const packageJson = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
packageJson.engines = { ...(packageJson.engines || {}), node: '>=20.0.0' };
packageJson.dependencies = {
  ...(packageJson.dependencies || {}),
  '@huggingface/inference': '^4.13.30',
  '@modelcontextprotocol/server': '^2.1.0',
  '@vercel/blob': '^2.8.0',
  jose: '^6.2.12',
  'mcp-handler': '^2.2.0',
  zod: '^4.6.5',
};
await put('package.json', JSON.stringify(packageJson, null, 2));

await put('.env.example', `# Server-only. Never prefix these with NEXT_PUBLIC_.
BANDD_SYNC_KEY=
BANDD_GPT_KEY=
BANDD_CLAUDE_KEY=
BANDD_GROK_KEY=
GITHUB_TOKEN=
GITHUB_REPO=Karibrk/Bernov-Dragons-GPT
GITHUB_BRANCH=main
PUBLIC_BASE_URL=
BANDD_IMAGE_MODEL=google/gemini-3.1-flash-image-preview
# BLOB_READ_WRITE_TOKEN is normally injected by the connected Vercel Blob store.
`);

await put('api/_web.js', `export function resolveBaseUrl(req) {
  const explicit = process.env.PUBLIC_BASE_URL || process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) return explicit.replace(/\\/+$/, '');
  const protocol = String(req.headers['x-forwarded-proto'] || 'https').split(',')[0].trim() || 'https';
  const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost:3000';
  return \`${'${protocol}'}://${'${host}'}\`;
}

export async function asWebRequest(req) {
  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers)) {
    if (Array.isArray(value)) headers.set(name, value.join(','));
    else if (value !== undefined) headers.set(name, String(value));
  }
  if (!headers.has('authorization') && headers.has('x-bandd-key')) {
    headers.set('authorization', \`Bearer ${'${headers.get(\'x-bandd-key\')}'}\`);
  }
  const init = { method: req.method, headers };
  if (!['GET', 'HEAD'].includes(req.method || 'GET') && req.body !== undefined) {
    init.body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
  }
  return new Request(new URL(req.url || '/', resolveBaseUrl(req)).toString(), init);
}

export async function sendWebResponse(res, response) {
  res.status(response.status);
  response.headers.forEach((value, name) => res.setHeader(name, value));
  res.send(Buffer.from(await response.arrayBuffer()));
}
`);

const mcpAuth = await readFile(join(root, 'api/_mcp-auth.js'), 'utf8');
const authPatched = mcpAuth
  .replace(/^const resource = .*;\n/m, "const resource = new URL('/api/mcp', appBaseUrl()).toString();\n")
  .replace(/^let jwks;/m, "let jwks;\n\nexport function appBaseUrl() {\n  const explicit = process.env.PUBLIC_BASE_URL || process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_SITE_URL;\n  if (explicit) return explicit.replace(/\\/+$/, '');\n  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;\n  return 'https://500900.website';\n}\n")
  .replace(/export function protectedResourceUrl\(\) \{\n  return resource;\n\}/, "export function protectedResourceUrl() {\n  return resource;\n}\n\nexport function protectedResourceMetadataUrl() {\n  return new URL('/.well-known/oauth-protected-resource', appBaseUrl()).toString();\n}");
await put('api/_mcp-auth.js', authPatched);

const mcp = await readFile(join(root, 'api/mcp.js'), 'utf8');
await put('api/mcp.js', mcp
  .replace("authenticateMcpToken, hasScope, protectedResourceUrl, requiredScopeForMcpRequest", "authenticateMcpToken, hasScope, protectedResourceMetadataUrl, protectedResourceUrl, requiredScopeForMcpRequest")
  .replace(/resource_metadata=\\"https:\\/\\/500900\\.website\\/\\.well-known\\/oauth-protected-resource\\"/, 'resource_metadata=\\"${protectedResourceMetadataUrl()}\\"'));

const build = await readFile(join(root, 'build-latest.mjs'), 'utf8');
await put('build-latest.mjs', build.replace(/    } catch \{\}/, "    } catch (error) {\n      if (error?.code !== 'ENOENT') throw error;\n    }"));

const state = await readFile(join(root, 'api/_state.js'), 'utf8');
await put('api/_state.js', state.replace("import { get, put } from '@vercel/blob';", "import { del, get, list, put } from '@vercel/blob';")
  .replace("import { blobAuth } from './_auth.js';", "import { blobAuth } from './_auth.js';\n\nconst BACKUP_LIMIT = Number(process.env.BANDD_BACKUP_LIMIT || 30);")
  .replace("  return { ok: true, savedAt };", `  const backups = await list({ prefix: 'runtime/backups/', limit: 200, ...auth });
  const stale = backups.blobs
    .filter((blob) => blob?.pathname?.startsWith('runtime/backups/state-'))
    .sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt))
    .slice(BACKUP_LIMIT);
  for (const blob of stale) if (blob.url) await del(blob.url, auth);
  return { ok: true, savedAt };`));

await rm(join(root, '.github/workflows/jekyll-docker.yml'), { force: true });

execFileSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['install', '--package-lock-only'], { cwd: root, stdio: 'inherit' });
for (const path of ['api/_web.js', 'api/_mcp-auth.js', 'api/mcp.js', 'api/_state.js', 'build-latest.mjs']) {
  execFileSync(process.execPath, ['--check', path], { cwd: root, stdio: 'inherit' });
}
execFileSync(process.execPath, ['build-latest.mjs'], { cwd: root, stdio: 'inherit' });

console.log(`Cleanup completed. Backup created at ${backupRoot}`);
