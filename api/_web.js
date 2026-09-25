export function resolveBaseUrl(req) {
  const explicit = process.env.PUBLIC_BASE_URL || process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) return explicit.replace(/\/+$/, '');

  const protocol = String(req.headers['x-forwarded-proto'] || 'https').split(',')[0].trim() || 'https';
  const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost:3000';
  return `${protocol}://${host}`;
}

export async function asWebRequest(req) {
  const baseUrl = resolveBaseUrl(req);
  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers)) {
    if (Array.isArray(value)) headers.set(name, value.join(','));
    else if (value !== undefined) headers.set(name, String(value));
  }
  if (!headers.has('authorization') && headers.has('x-bandd-key')) {
    headers.set('authorization', `Bearer ${headers.get('x-bandd-key')}`);
  }

  const init = { method: req.method, headers };
  if (!['GET', 'HEAD'].includes(req.method || 'GET') && req.body !== undefined) {
    init.body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
  }

  return new Request(new URL(req.url || '/', baseUrl).toString(), init);
}

export async function sendWebResponse(res, response) {
  res.status(response.status);
  response.headers.forEach((value, name) => res.setHeader(name, value));
  res.send(Buffer.from(await response.arrayBuffer()));
}
