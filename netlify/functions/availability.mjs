// GET /api/availability → { booked: [[start, end), ...], updated }
// Reads your Airbnb calendar export (and any extra .ics feeds, e.g. your booking software),
// so the site's calendars always match what's actually booked.
import { bookedRanges } from '../lib/ical.mjs';

export default async () => {
  const urls = [process.env.AIRBNB_ICAL_URL, ...String(process.env.EXTRA_ICAL_URLS || '').split(',')]
    .map((u) => (u || '').trim()).filter(Boolean);
  if (!urls.length) {
    return Response.json({ booked: [], configured: false }, { status: 503 });
  }
  const booked = [];
  const errors = [];
  for (const url of urls) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'ValleyViewChalet/1.0' } });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      booked.push(...bookedRanges(await res.text()));
    } catch (e) { errors.push(String(e.message || e)); }
  }
  if (!booked.length && errors.length === urls.length) {
    return Response.json({ booked: [], error: 'calendar unavailable' }, { status: 502 });
  }
  booked.sort((a, b) => (a[0] < b[0] ? -1 : 1));
  return Response.json({ booked, updated: new Date().toISOString() }, {
    headers: {
      'Cache-Control': 'public, max-age=300',
      'Netlify-CDN-Cache-Control': 'public, s-maxage=900, stale-while-revalidate=3600'
    }
  });
};

export const config = { path: '/api/availability' };
