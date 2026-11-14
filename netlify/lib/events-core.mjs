// Shared logic for the daily events import, the public events API and the admin page.
import { createHash } from 'node:crypto';
import { parseICS } from './ical.mjs';
import { SOURCES, EXCLUDE, MINUTES, categorize, findTown } from './sources.mjs';

const UA = 'ValleyViewChaletEvents/1.0 (+events calendar for a single vacation rental)';

const todayNY = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date());

function plusDays(ymd, n) {
  const d = new Date(ymd + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function eventId(source, title, date) {
  return createHash('sha1').update(`${source}|${String(title).toLowerCase().replace(/\s+/g, ' ').trim()}|${date}`).digest('hex').slice(0, 16);
}

function cleanTitle(t) {
  return String(t || '').replace(/\s+/g, ' ').replace(/&amp;/g, '&').replace(/&#039;|&#8217;/g, '’').trim();
}

// ----- readers -----------------------------------------------------------------------

async function fetchText(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/calendar, text/html, */*' }, redirect: 'follow' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

function fromIcal(text) {
  return parseICS(text).map((e) => ({
    title: e.summary,
    start: e.start.date,
    end: e.end ? (e.end.allDay ? plusDays(e.end.date, -1) : e.end.date) : null, // all-day DTEND is exclusive
    time: e.start.time,
    location: e.location || '',
    url: e.url || null,
    text: [e.summary, e.location, (e.categories || []).join(' ')].join(' ')
  }));
}

// schema.org Event objects embedded as JSON-LD
function fromJsonLd(html, pageUrl) {
  const out = [];
  const blocks = html.match(/<script[^>]+type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi) || [];
  const visit = (node) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { node.forEach(visit); return; }
    const type = [].concat(node['@type'] || []).join(' ');
    if (/Event\b/.test(type) && node.name && node.startDate) {
      const loc = [].concat(node.location || [])[0] || {};
      const addr = loc.address || {};
      const s = String(node.startDate);
      const timeMatch = s.match(/T(\d{2}):(\d{2})/);
      let time = null;
      if (timeMatch && !(timeMatch[1] === '00' && timeMatch[2] === '00')) {
        const h = +timeMatch[1]; time = `${h % 12 || 12}:${timeMatch[2]} ${h >= 12 ? 'pm' : 'am'}`;
      }
      out.push({
        title: node.name,
        start: s.slice(0, 10),
        end: node.endDate ? String(node.endDate).slice(0, 10) : null,
        time,
        location: [loc.name, typeof addr === 'string' ? addr : addr.addressLocality].filter(Boolean).join(', '),
        url: node.url ? new URL(node.url, pageUrl).toString() : pageUrl,
        text: [node.name, loc.name, typeof addr === 'string' ? addr : addr.addressLocality, node.description].join(' ')
      });
    }
    if (node['@graph']) visit(node['@graph']);
    for (const k of ['itemListElement', 'item', 'subEvent', 'event', 'events']) if (node[k]) visit(node[k]);
  };
  for (const b of blocks) {
    const json = b.replace(/^<script[^>]*>/i, '').replace(/<\/script>$/i, '').trim();
    try { visit(JSON.parse(json)); } catch { /* skip malformed block */ }
  }
  return out;
}

// ----- normalize -------------------------------------------------------------------

export function normalize(raw, source) {
  const title = cleanTitle(raw.title);
  if (!title || !/^\d{4}-\d{2}-\d{2}$/.test(raw.start)) return null;
  if (EXCLUDE.test(title)) return null;
  const town = source.scope === 'venue' ? (findTown(raw.location) || source.town) : findTown(raw.text);
  if (source.scope === 'region' && !town) return null; // outside our area
  const end = raw.end && raw.end > raw.start ? raw.end : null;
  return {
    id: eventId(source.name, title, raw.start),
    title,
    start: raw.start,
    end,
    time: raw.time || null,
    town: town || null,
    minutes: town && MINUTES[town] ? MINUTES[town] : null,
    category: categorize(raw.text || title),
    source: source.name,
    url: raw.url || source.url
  };
}

// Simple cross-source duplicate check (same day, near-identical title)
function dupeKey(e) {
  // town is part of the key so "Opening Day" at two different mountains stays separate
  return e.start + '|' + (e.town || '') + '|' + e.title.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 40);
}

export async function runImport() {
  const today = todayNY();
  const horizon = plusDays(today, 180);
  const report = {};
  const all = [];
  for (const source of SOURCES) {
    if (source.enabled === false) { report[source.name] = { ok: null, count: 0, note: source.note }; continue; }
    try {
      const text = await fetchText(source.url);
      const raw = source.type === 'ical' ? fromIcal(text) : fromJsonLd(text, source.url);
      const items = raw.map((r) => normalize(r, source)).filter(Boolean)
        .filter((e) => (e.end || e.start) >= today && e.start <= horizon);
      all.push(...items);
      report[source.name] = { ok: true, count: items.length, found: raw.length, note: raw.length ? undefined : source.note };
    } catch (err) {
      report[source.name] = { ok: false, count: 0, error: String(err.message || err), note: source.note };
    }
  }
  const seen = new Set();
  const unique = [];
  for (const e of all) { const k = dupeKey(e); if (!seen.has(k)) { seen.add(k); unique.push(e); } }
  return { events: unique, report, ranAt: new Date().toISOString() };
}

// ----- storage (Netlify Blobs) -----------------------------------------------------

export async function getEventsStore() {
  const { getStore } = await import('@netlify/blobs');
  return getStore({ name: 'events', consistency: 'strong' });
}

export async function loadState(store) {
  const [candidates, decisions, meta] = await Promise.all([
    store.get('candidates', { type: 'json' }),
    store.get('decisions', { type: 'json' }),
    store.get('meta', { type: 'json' })
  ]);
  return { candidates: candidates || {}, decisions: decisions || {}, meta: meta || {} };
}

export async function importAndSave(store) {
  const result = await runImport();
  const { candidates } = await loadState(store);
  const today = todayNY();
  // keep previously seen future events (sources sometimes drop items), refresh the rest
  for (const [id, e] of Object.entries(candidates)) if ((e.end || e.start) < today) delete candidates[id];
  for (const e of result.events) candidates[e.id] = { ...candidates[e.id], ...e, firstSeen: candidates[e.id]?.firstSeen || result.ranAt };
  await store.setJSON('candidates', candidates);
  await store.setJSON('meta', { lastRun: result.ranAt, report: result.report });
  return result;
}

export function autoApproveSources() {
  return String(process.env.EVENTS_AUTO_APPROVE_SOURCES || '').split(',').map((s) => s.trim()).filter(Boolean);
}

export function publicEvents(state) {
  const today = todayNY();
  const auto = autoApproveSources();
  return Object.values(state.candidates)
    .filter((e) => (e.end || e.start) >= today)
    .filter((e) => {
      const d = state.decisions[e.id];
      if (d === 'hidden') return false;
      return d === 'approved' || d === 'featured' || auto.includes(e.source);
    })
    .map(({ firstSeen, ...e }) => ({ ...e, featured: state.decisions[e.id] === 'featured' }))
    .sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));
}

export { fromIcal, fromJsonLd, todayNY };
