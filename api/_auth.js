import crypto from 'node:crypto';

export function requireKey(req, res) {
  const expected = process.env.BANDD_SYNC_KEY || '';
  const got = String(req.headers['x-bandd-key'] || '');
  if (!expected) {
    res.status(503).json({ ok:false, error:'BANDD_SYNC_KEY is not configured on Vercel.' });
    return false;
  }
  const a = Buffer.from(expected), b = Buffer.from(got);
  if (a.length !== b.length || !crypto.timingSafeEqual(a,b)) {
    res.status(401).json({ ok:false, error:'Unauthorized' });
    return false;
  }
  return true;
}

export function blobAuth() {
  if (process.env.BLOB_READ_WRITE_TOKEN) return { token: process.env.BLOB_READ_WRITE_TOKEN };
  if (process.env.VERCEL_OIDC_TOKEN) return { oidcToken: process.env.VERCEL_OIDC_TOKEN };
  return {};
}
