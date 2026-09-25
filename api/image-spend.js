import { requireKey } from './_auth.js';

function gatewayToken() {
  return process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN || '';
}

function creditBalance(payload) {
  const value = payload?.balance ?? payload?.remaining ?? payload?.credits?.remaining ?? null;
  return typeof value === 'number' ? value : null;
}

export async function gatewayCredits() {
  const token = gatewayToken();
  if (!token) return { available: false, remaining: null };
  const response = await fetch('https://ai-gateway.vercel.sh/v1/credits', {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) return { available: false, remaining: null };
  const payload = await response.json();
  return { available: true, remaining: creditBalance(payload) };
}

export default async function handler(req, res) {
  if (!requireKey(req, res)) return;
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'Method not allowed' });
  try {
    const credits = await gatewayCredits();
    return res.status(200).json({ ok: true, paidModel: 'google/gemini-3-pro-image', ...credits });
  } catch {
    return res.status(502).json({ ok: false, error: 'AI Gateway credits are unavailable.' });
  }
}
