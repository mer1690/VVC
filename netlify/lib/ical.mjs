// Minimal iCalendar (RFC 5545) reader — enough for Airbnb calendar exports and
// public event feeds (WordPress "The Events Calendar", Google Calendar, etc.).

const TZ = 'America/New_York';

function unfold(text) {
  return String(text).replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n[ \t]/g, '');
}

function unescapeText(v) {
  return v.replace(/\\n/gi, '\n').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\\\/g, '\\');
}

function parseLine(line) {
  const colon = findValueColon(line);
  if (colon < 0) return null;
  const left = line.slice(0, colon);
  const value = line.slice(colon + 1);
  const parts = left.split(';');
  const name = parts.shift().toUpperCase();
  const params = {};
  for (const p of parts) {
    const eq = p.indexOf('=');
    if (eq > 0) params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1).replace(/^"|"$/g, '');
  }
  return { name, params, value };
}

// The first colon that is not inside a quoted parameter value
function findValueColon(line) {
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') q = !q;
    else if (c === ':' && !q) return i;
  }
  return -1;
}

const pad = (n) => String(n).padStart(2, '0');

function localParts(date) {
  const f = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: 'numeric', minute: '2-digit', hour12: true
  }).formatToParts(date);
  const get = (t) => (f.find((p) => p.type === t) || {}).value;
  return { date: `${get('year')}-${get('month')}-${get('day')}`, time: `${get('hour')}:${get('minute')} ${String(get('dayPeriod')).toLowerCase()}` };
}

function formatTime(h, m) {
  const ap = h >= 12 ? 'pm' : 'am';
  const hh = h % 12 || 12;
  return `${hh}:${pad(m)} ${ap}`;
}

// Returns { date: 'YYYY-MM-DD', time: '7:00 pm' | null, allDay: boolean }
export function parseIcsDate(value, params = {}) {
  const v = String(value).trim();
  const m = v.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/);
  if (!m) return null;
  const [, y, mo, d, hh, mi, , z] = m;
  if (!hh || params.VALUE === 'DATE') return { date: `${y}-${mo}-${d}`, time: null, allDay: true };
  if (z) {
    const utc = new Date(Date.UTC(+y, +mo - 1, +d, +hh, +mi));
    const lp = localParts(utc);
    return { date: lp.date, time: lp.time, allDay: false };
  }
  // Floating or TZID time: treat as local (the feeds we use are all Eastern time)
  return { date: `${y}-${mo}-${d}`, time: formatTime(+hh, +mi), allDay: false };
}

export function parseICS(text) {
  const lines = unfold(text).split('\n');
  const events = [];
  let cur = null;
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line) continue;
    if (line === 'BEGIN:VEVENT') { cur = {}; continue; }
    if (line === 'END:VEVENT') { if (cur) events.push(cur); cur = null; continue; }
    if (!cur) continue;
    const p = parseLine(line);
    if (!p) continue;
    switch (p.name) {
      case 'UID': cur.uid = p.value; break;
      case 'SUMMARY': cur.summary = unescapeText(p.value); break;
      case 'DESCRIPTION': cur.description = unescapeText(p.value); break;
      case 'LOCATION': cur.location = unescapeText(p.value); break;
      case 'URL': cur.url = p.value; break;
      case 'CATEGORIES': cur.categories = unescapeText(p.value).split(',').map((s) => s.trim()).filter(Boolean); break;
      case 'STATUS': cur.status = p.value.toUpperCase(); break;
      case 'DTSTART': cur.start = parseIcsDate(p.value, p.params); break;
      case 'DTEND': cur.end = parseIcsDate(p.value, p.params); break;
      default: break;
    }
  }
  return events.filter((e) => e.start);
}

// Airbnb/booking-software calendar export → booked ranges [start, end) as YYYY-MM-DD
export function bookedRanges(text) {
  return parseICS(text)
    .filter((e) => e.status !== 'CANCELLED')
    .map((e) => {
      const start = e.start.date;
      let end = e.end ? e.end.date : start;
      if (end <= start) { // single-day block
        const d = new Date(start + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + 1);
        end = d.toISOString().slice(0, 10);
      }
      return [start, end];
    })
    .sort((a, b) => (a[0] < b[0] ? -1 : 1));
}
