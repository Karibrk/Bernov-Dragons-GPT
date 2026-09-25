import { requireKey } from './_auth.js';

const VERSION_RX = /^\d+\.\d+\.\d+\.\d+$/;

function stripPreviewRuntime(html) {
  return html
    .replace(/<script[^>]*\bid=["']ibScript["'][^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<script[^>]*src=["'][^"']*ibfunctions\.js[^"']*["'][^>]*>\s*<\/script>/gi, '')
    .replace(/<!--\s*frame-runtime\s*-->/gi, '')
    .replace(/<script>\s*window\.__FRAME_PREAMBLE\s*=[\s\S]*?<\/script>/g, '')
    .replace(/<script>\(function\(\)\{"use strict";function sr\(t\)\{return t==="cookie"[\s\S]*?<\/script>/g, '');
}

async function putFile({ token, repo, branch, path, content, message }) {
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'Bernov-Dragons-GPT',
  };
  const url = `https://api.github.com/repos/${repo}/contents/${path.split('/').map(encodeURIComponent).join('/')}`;
  let sha = null;
  const existing = await fetch(`${url}?ref=${encodeURIComponent(branch)}`, { headers });
  if (existing.ok) {
    const j = await existing.json();
    sha = j.sha || null;
  } else if (existing.status !== 404) {
    throw new Error(`GitHub read ${path}: ${existing.status} ${(await existing.text()).slice(0, 180)}`);
  }
  const body = { message, content: Buffer.from(content, 'utf8').toString('base64'), branch };
  if (sha) body.sha = sha;
  const wr = await fetch(url, {
    method: 'PUT',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const txt = await wr.text();
  let j = {};
  try { j = JSON.parse(txt); } catch { j = { raw: txt }; }
  if (!wr.ok) throw new Error(`GitHub write ${path}: ${wr.status} ${txt.slice(0, 220)}`);
  return { commitSha: j?.commit?.sha || null, contentSha: j?.content?.sha || null };
}

export default async function handler(req, res) {
  if (!requireKey(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });
  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPO || 'Karibrk/Bernov-Dragons-GPT';
  const branch = process.env.GITHUB_BRANCH || 'main';
  if (!token) return res.status(503).json({ ok: false, error: 'GITHUB_TOKEN missing' });
  const version = String(req.body?.version || '');
  let html = String(req.body?.html || '');
  if (!VERSION_RX.test(version)) return res.status(400).json({ ok: false, error: 'Bad version, expected x.x.x.x' });
  if (!html.startsWith('<!DOCTYPE html>') || html.length < 10000 || html.length > 6_000_000) {
    return res.status(400).json({ ok: false, error: 'Bad HTML payload' });
  }
  html = stripPreviewRuntime(html);
  const dataVersion = html.match(/window\.DATA\s*=\s*\{"VERSION":"([^"]+)"/)?.[1];
  if (dataVersion !== version) {
    return res.status(400).json({
      ok: false,
      error: `DATA.VERSION (${dataVersion || 'chybí'}) != requested version (${version})`,
    });
  }
  if (/window\.__FRAME_PREAMBLE\s*=/.test(html) || /id=["']ibScript["']/.test(html) || /ibfunctions\.js/.test(html)) {
    return res.status(400).json({ ok: false, error: 'Preview/runtime injection is not allowed in publish payload' });
  }
  const filename = `DENÍK_CORE_V${version}.gpt.html`;
  try {
    const published = await putFile({
      token,
      repo,
      branch,
      path: filename,
      content: html,
      message: `denik: publish ${filename}`,
    });
    return res.status(200).json({
      ok: true,
      filename,
      version,
      commitSha: published.commitSha,
      note: 'index.html is build output only; Vercel builds dist/index.html from this file',
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e.message || e) });
  }
}
