// Signed, expiring session token for the returning-guest area (HMAC-SHA256).
import { createHmac, timingSafeEqual } from 'node:crypto';

const b64url = (buf) => Buffer.from(buf).toString('base64url');

export const COOKIE = 'vv_returning';

function secret() {
  const s = process.env.RETURNING_SECRET;
  if (!s || s.length < 24) throw new Error('RETURNING_SECRET is missing or too short (use 32+ random characters).');
  return s;
}

export function createToken(ttlSeconds = 60 * 60 * 24 * 7) {
  const payload = b64url(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + ttlSeconds }));
  const sig = b64url(createHmac('sha256', secret()).update(payload).digest());
  return `${payload}.${sig}`;
}

export function verifyToken(token) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return false;
  const [payload, sig] = token.split('.');
  const expected = createHmac('sha256', secret()).update(payload).digest();
  let given;
  try { given = Buffer.from(sig, 'base64url'); } catch { return false; }
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return false;
  try {
    const { exp } = JSON.parse(Buffer.from(payload, 'base64url').toString());
    return typeof exp === 'number' && exp > Date.now() / 1000;
  } catch { return false; }
}

// Compare a guest-entered code with the list in RETURNING_GUEST_CODES (comma-separated)
export function codeIsValid(input) {
  const list = String(process.env.RETURNING_GUEST_CODES || '')
    .split(',').map((c) => c.trim().toUpperCase()).filter(Boolean);
  const given = String(input || '').trim().toUpperCase();
  if (!given || !list.length) return false;
  let ok = false;
  for (const code of list) {
    const a = Buffer.from(code), b = Buffer.from(given);
    if (a.length === b.length && timingSafeEqual(a, b)) ok = true; // no early exit
  }
  return ok;
}

export function readCookie(req, name) {
  const header = req.headers.get('cookie') || '';
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return null;
}
