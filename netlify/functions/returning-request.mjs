// /returning/request — the private returning-guest request form.
// GET shows the form only with a valid session cookie (set by /api/returning-unlock).
// POST verifies the cookie again, then forwards the request to Netlify Forms (so you get
// the usual email notification) and keeps a copy in Netlify Blobs.
import { verifyToken, readCookie, COOKIE } from '../lib/token.mjs';
import { renderReturningPage } from '../lib/returning-template.mjs';

const html = (body, status = 200) => new Response(body, {
  status,
  headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' }
});
const go = (location) => new Response(null, { status: 303, headers: { Location: location, 'Cache-Control': 'no-store' } });

const FIELDS = ['arrive', 'depart', 'guests', 'name', 'email', 'phone', 'pet', 'message'];

export default async (req) => {
  let ok = false;
  try { ok = verifyToken(readCookie(req, COOKIE)); } catch (e) { console.error(e.message); }
  if (!ok) return go('/returning.html?error=expired');

  const url = new URL(req.url);
  if (req.method === 'GET') {
    return html(renderReturningPage({ sent: url.searchParams.get('sent') === '1', rate: process.env.RETURNING_RATE_TEXT }));
  }
  if (req.method !== 'POST') return go('/returning/request');

  const form = await req.formData();
  if (form.get('company')) return go('/returning/request?sent=1'); // honeypot: pretend success

  const entry = { receivedAt: new Date().toISOString() };
  for (const f of FIELDS) entry[f] = String(form.get(f) || '').slice(0, 2000).trim();
  if (!entry.name || !entry.email || !entry.arrive || !entry.depart) {
    return html(renderReturningPage({ error: 'Please add your name, email and dates.', values: entry, rate: process.env.RETURNING_RATE_TEXT }), 400);
  }

  // 1) Keep a copy
  try {
    const { getStore } = await import('@netlify/blobs');
    await getStore({ name: 'returning-requests' }).setJSON(`${entry.receivedAt}-${Math.random().toString(36).slice(2, 8)}`, entry);
  } catch (e) { console.error('blob save failed', e.message); }

  // 2) Forward to Netlify Forms → email notification (set it up under Site settings → Forms)
  try {
    const body = new URLSearchParams({ 'form-name': 'returning-request', verified: 'yes', ...entry });
    const site = process.env.URL || url.origin;
    await fetch(new URL('/', site), { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
  } catch (e) { console.error('forms forward failed', e.message); }

  return go('/returning/request?sent=1');
};

export const config = { path: '/returning/request' };
