// POST /api/returning-unlock — checks a returning-guest code on the server and, if it
// matches, sets a signed 7-day session cookie and opens the private request form.
import { codeIsValid, createToken, COOKIE } from '../lib/token.mjs';

const WINDOW_MS = 10 * 60 * 1000;
const MAX_TRIES = 8;

async function tooManyAttempts(ip) {
  try {
    const { getStore } = await import('@netlify/blobs');
    const store = getStore({ name: 'rate-limit', consistency: 'strong' });
    const key = 'unlock-' + ip.replace(/[^0-9a-f:.]/gi, '');
    const now = Date.now();
    const rec = (await store.get(key, { type: 'json' })) || { n: 0, t: now };
    if (now - rec.t > WINDOW_MS) { rec.n = 0; rec.t = now; }
    rec.n += 1;
    await store.setJSON(key, rec);
    return rec.n > MAX_TRIES;
  } catch { return false; } // never lock guests out because of a storage hiccup
}

const go = (location, cookie) => new Response(null, {
  status: 303,
  headers: { Location: location, 'Cache-Control': 'no-store', ...(cookie ? { 'Set-Cookie': cookie } : {}) }
});

export default async (req, context) => {
  if (req.method !== 'POST') return go('/returning.html');
  const ip = context?.ip || req.headers.get('x-nf-client-connection-ip') || 'unknown';
  if (await tooManyAttempts(ip)) return go('/returning.html?error=busy');

  const form = await req.formData();
  const code = form.get('code');
  if (!codeIsValid(code)) {
    await new Promise((r) => setTimeout(r, 400)); // slow down guessing
    return go('/returning.html?error=code');
  }
  const cookie = `${COOKIE}=${encodeURIComponent(createToken())}; Path=/returning; HttpOnly; Secure; SameSite=Lax; Max-Age=${60 * 60 * 24 * 7}`;
  return go('/returning/request', cookie);
};

export const config = { path: '/api/returning-unlock' };
