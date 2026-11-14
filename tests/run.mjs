// Run with: npm test   (no Netlify account needed)
import assert from 'node:assert/strict';
import http from 'node:http';

process.env.RETURNING_SECRET = 'test-secret-that-is-long-enough-1234567890';
process.env.RETURNING_GUEST_CODES = 'VALLEY-2026, friends';

const { parseICS, bookedRanges, parseIcsDate } = await import('../netlify/lib/ical.mjs');
const { createToken, verifyToken, codeIsValid } = await import('../netlify/lib/token.mjs');
const { normalize, fromJsonLd, fromIcal } = await import('../netlify/lib/events-core.mjs');
const { categorize, findTown } = await import('../netlify/lib/sources.mjs');
const { renderReturningPage } = await import('../netlify/lib/returning-template.mjs');

let passed = 0;
const test = async (name, fn) => { await fn(); passed++; console.log('  ✓', name); };

console.log('iCal');
const AIRBNB = `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nDTEND;VALUE=DATE:20261207\r\nDTSTART;VALUE=DATE:20261204\r\nUID:abc@airbnb.com\r\nSUMMARY:Reserved\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nDTEND;VALUE=DATE:20261228\r\nDTSTART;VALUE=DATE:20261219\r\nUID:def@airbnb.com\r\nSUMMARY:Airbnb (Not available)\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n`;
await test('reads Airbnb booked ranges (checkout day stays open)', () => {
  assert.deepEqual(bookedRanges(AIRBNB), [['2026-12-04', '2026-12-07'], ['2026-12-19', '2026-12-28']]);
});
await test('unfolds long lines and unescapes text', () => {
  const ics = 'BEGIN:VEVENT\nSUMMARY:Holiday Market\\, Windham\n  & Parade\nDTSTART;TZID=America/New_York:20261205T170000\nLOCATION:Main St\\, Windham NY\nEND:VEVENT';
  const [e] = parseICS(ics);
  assert.equal(e.summary, 'Holiday Market, Windham & Parade');
  assert.equal(e.start.date, '2026-12-05');
  assert.equal(e.start.time, '5:00 pm');
  assert.equal(e.location, 'Main St, Windham NY');
});
await test('converts UTC times to Eastern', () => {
  assert.deepEqual(parseIcsDate('20261205T230000Z'), { date: '2026-12-05', time: '6:00 pm', allDay: false });
});

console.log('Returning-guest codes');
await test('accepts listed codes in any case, rejects others', () => {
  assert.equal(codeIsValid('valley-2026'), true);
  assert.equal(codeIsValid(' FRIENDS '), true);
  assert.equal(codeIsValid('VALLEY-2025'), false);
  assert.equal(codeIsValid(''), false);
});
await test('session tokens verify, and tampered/expired ones fail', () => {
  const t = createToken();
  assert.equal(verifyToken(t), true);
  assert.equal(verifyToken(t.slice(0, -2) + 'xx'), false);
  assert.equal(verifyToken(createToken(-10)), false);
  assert.equal(verifyToken('nonsense'), false);
});

console.log('Events import');
const venue = { name: 'Windham Mountain', scope: 'venue', town: 'Windham', url: 'https://example.com/events' };
const region = { name: 'Greene County', scope: 'region', url: 'https://example.com/cal' };
await test('drops members-only and staff events', () => {
  assert.equal(normalize({ title: 'Welcome Back Member Mixer', start: '2026-11-28', text: '' }, venue), null);
  assert.equal(normalize({ title: 'Instructors New Hire Training Day', start: '2026-11-28', text: '' }, venue), null);
  assert.equal(normalize({ title: 'Town Board Meeting', start: '2026-11-28', text: 'Lexington' }, region), null);
});
await test('keeps venue events and tags town, drive time and category', () => {
  const e = normalize({ title: 'The 2026 Windham Manor Holiday Market', start: '2026-11-28', end: '2026-11-29', text: 'Holiday Market' }, venue);
  assert.equal(e.town, 'Windham'); assert.equal(e.minutes, 20); assert.equal(e.category, 'Markets'); assert.equal(e.end, '2026-11-29');
});
await test('region feeds keep only nearby towns', () => {
  assert.ok(normalize({ title: 'Fiddle night', start: '2026-12-01', text: 'Fiddle night Prattsville Town Hall' }, region));
  assert.equal(normalize({ title: 'Fiddle night', start: '2026-12-01', text: 'Fiddle night Coxsackie' }, region), null);
});
await test('category and town helpers', () => {
  assert.equal(categorize('Catskill Mountain Shakespeare presents Hamlet'), 'Theater');
  assert.equal(categorize('Opening Day at Hunter'), 'Ski');
  assert.equal(findTown('Main St, Haines Falls, NY'), 'Haines Falls');
});
await test('reads schema.org events from a web page', () => {
  const html = `<html><script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"Event","name":"Tree Lighting","startDate":"2026-12-05T17:00:00-05:00","url":"/events/tree","location":{"@type":"Place","name":"Main Street","address":{"addressLocality":"Windham"}}}]}</script></html>`;
  const [e] = fromJsonLd(html, 'https://www.windhammountain.com/visit/events/');
  assert.equal(e.title, 'Tree Lighting'); assert.equal(e.start, '2026-12-05'); assert.equal(e.time, '5:00 pm');
  assert.equal(e.url, 'https://www.windhammountain.com/events/tree');
});
await test('all-day iCal end dates become inclusive', () => {
  const [e] = fromIcal('BEGIN:VEVENT\nSUMMARY:Fair\nDTSTART;VALUE=DATE:20261128\nDTEND;VALUE=DATE:20261130\nEND:VEVENT');
  assert.equal(e.end, '2026-11-29');
});

console.log('Functions');
const unlock = (await import('../netlify/functions/returning-unlock.mjs')).default;
const request = (await import('../netlify/functions/returning-request.mjs')).default;
const post = (url, data, headers = {}) => new Request(url, { method: 'POST', body: new URLSearchParams(data), headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...headers } });

let cookie;
await test('wrong code → back to the gate with an error', async () => {
  const r = await unlock(post('https://site.test/api/returning-unlock', { code: 'nope' }), {});
  assert.equal(r.status, 303); assert.equal(r.headers.get('location'), '/returning.html?error=code');
  assert.equal(r.headers.get('set-cookie'), null);
});
await test('right code → signed HttpOnly cookie and redirect to the private form', async () => {
  const r = await unlock(post('https://site.test/api/returning-unlock', { code: 'valley-2026' }), {});
  assert.equal(r.headers.get('location'), '/returning/request');
  cookie = r.headers.get('set-cookie');
  assert.match(cookie, /HttpOnly/); assert.match(cookie, /Secure/); assert.match(cookie, /Path=\/returning/);
});
await test('private form is refused without the cookie', async () => {
  const r = await request(new Request('https://site.test/returning/request'));
  assert.equal(r.status, 303); assert.equal(r.headers.get('location'), '/returning.html?error=expired');
});
await test('private form is served with the cookie', async () => {
  const r = await request(new Request('https://site.test/returning/request', { headers: { cookie: cookie.split(';')[0] } }));
  assert.equal(r.status, 200);
  const body = await r.text();
  assert.match(body, /Tell us when you'd like to come back/);
});
await test('submitting without required fields shows an error', async () => {
  const r = await request(post('https://site.test/returning/request', { name: 'A' }, { cookie: cookie.split(';')[0] }));
  assert.equal(r.status, 400);
});
await test('thank-you page escapes nothing unsafe', () => {
  const page = renderReturningPage({ error: '<script>x</script>', values: { name: '"><b>' } });
  assert.ok(!page.includes('<script>x</script>')); assert.ok(page.includes('&quot;&gt;&lt;b&gt;'));
});

// availability against a local fake Airbnb feed
const server = http.createServer((req, res) => { res.writeHead(200, { 'Content-Type': 'text/calendar' }); res.end(AIRBNB); }).listen(0);
await new Promise((r) => server.once('listening', r));
process.env.AIRBNB_ICAL_URL = `http://127.0.0.1:${server.address().port}/airbnb.ics`;
const availability = (await import('../netlify/functions/availability.mjs')).default;
await test('availability API returns booked ranges', async () => {
  const r = await availability(new Request('https://site.test/api/availability'));
  const j = await r.json();
  assert.equal(r.status, 200); assert.equal(j.booked.length, 2);
});
server.close();

console.log(`\n${passed} tests passed`);
