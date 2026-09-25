import crypto from 'node:crypto';
import { get, put } from '@vercel/blob';
import { Readable } from 'node:stream';
import { blobAuth } from './_auth.js';

const STATE_PATH = 'runtime/latest.json';
const BACKUP_PREFIX = 'runtime/backups/state-';

function stateBlobAuth() {
  const storeId = process.env.STATE_BLOB_STORE_ID;
  const oidcToken = process.env.VERCEL_OIDC_TOKEN;
  if (storeId && oidcToken) return { storeId, oidcToken };
  return blobAuth();
}

function stateCipherKey() {
  const secret = process.env.BANDD_SYNC_KEY || process.env.BANDD_GPT_KEY || '';
  if (!secret) throw new Error('No B&D state encryption key is configured');
  return crypto.scryptSync(secret, 'bernov-dragons-state-v1', 32);
}

function encryptState(value) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', stateCipherKey(), iv);
  const payload = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return JSON.stringify({
    version: 1,
    iv: iv.toString('base64url'),
    tag: cipher.getAuthTag().toString('base64url'),
    payload: payload.toString('base64url'),
  });
}

function decryptState(text) {
  const value = JSON.parse(text);
  // Preserve access to any state written before encrypted storage was enabled.
  if (!value || value.version !== 1 || !value.iv || !value.tag || !value.payload) return value;
  const decipher = crypto.createDecipheriv('aes-256-gcm', stateCipherKey(), Buffer.from(value.iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(value.tag, 'base64url'));
  const plain = Buffer.concat([decipher.update(Buffer.from(value.payload, 'base64url')), decipher.final()]);
  return JSON.parse(plain.toString('utf8'));
}

export async function loadState() {
  const result = await get(STATE_PATH, {
    access: 'private',
    useCache: false,
    ...stateBlobAuth(),
  });
  if (!result || result.statusCode !== 200) return null;
  let text = '';
  for await (const chunk of Readable.fromWeb(result.stream)) text += chunk.toString('utf8');
  return decryptState(text);
}

export async function saveState(state) {
  if (!state || typeof state !== 'object' || Array.isArray(state)) {
    throw new TypeError('Missing state');
  }
  const savedAt = new Date().toISOString();
  const payload = encryptState({ savedAt, state });
  const safeStamp = savedAt.replace(/[:.]/g, '-');
  const auth = stateBlobAuth();
  await put(`${BACKUP_PREFIX}${safeStamp}.json`, payload, {
    access: 'private', contentType: 'application/json', addRandomSuffix: false, ...auth,
  });
  await put(STATE_PATH, payload, {
    access: 'private', contentType: 'application/json', allowOverwrite: true, addRandomSuffix: false, ...auth,
  });
  return { ok: true, savedAt };
}
