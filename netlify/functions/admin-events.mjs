// /admin/events — private review page for imported events.
// Sign in with any username and the password in ADMIN_PASSWORD.
import { timingSafeEqual } from 'node:crypto';
import { getEventsStore, loadState, importAndSave, eventId, todayNY, autoApproveSources } from '../lib/events-core.mjs';
import { SOURCES, categorize, MINUTES } from '../lib/sources.mjs';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function authorized(req) {
  const pass = process.env.ADMIN_PASSWORD;
  if (!pass || pass.length < 10) return false;
  const h = req.headers.get('authorization') || '';
  if (!h.startsWith('Basic ')) return false;
  const decoded = Buffer.from(h.slice(6), 'base64').toString();
  const given = Buffer.from(decoded.slice(decoded.indexOf(':') + 1));
  const want = Buffer.from(pass);
  return given.length === want.length && timingSafeEqual(given, want);
}

const challenge = () => new Response('Sign in required', { status: 401, headers: { 'WWW-Authenticate': 'Basic realm="Valley View admin", charset="UTF-8"' } });

function sameOrigin(req) {
  const origin = req.headers.get('origin');
  if (!origin) return true; // some browsers omit Origin on same-origin form posts
  return origin === new URL(req.url).origin;
}

const CATS = ['Ski', 'Community', 'Markets', 'Music', 'Theater', 'Family', 'Outdoors'];

function page({ state, flash }) {
  const today = todayNY();
  const auto = autoApproveSources();
  const items = Object.values(state.candidates).filter((e) => (e.end || e.start) >= today)
    .sort((a, b) => (a.start < b.start ? -1 : 1));
  const status = (e) => state.decisions[e.id] || (auto.includes(e.source) ? 'auto' : 'new');
  const groups = { new: [], featured: [], approved: [], auto: [], hidden: [] };
  for (const e of items) groups[status(e)].push(e);
  const row = (e) => `
    <tr>
      <td class="d">${esc(e.start)}${e.end ? '<br><small>to ' + esc(e.end) + '</small>' : ''}${e.time ? '<br><small>' + esc(e.time) + '</small>' : ''}</td>
      <td><a href="${esc(e.url)}" target="_blank" rel="noopener">${esc(e.title)}</a><br><small>${esc([e.category, e.town, e.source].filter(Boolean).join(' · '))}</small></td>
      <td class="a">
        <form method="post"><input type="hidden" name="id" value="${esc(e.id)}">
          <button name="action" value="approved">Approve</button>
          <button name="action" value="featured">Feature</button>
          <button name="action" value="hidden">Hide</button>
          ${state.decisions[e.id] ? '<button name="action" value="reset">Reset</button>' : ''}
        </form>
      </td>
    </tr>`;
  const table = (title, list, hint) => `
    <h2>${title} <span>${list.length}</span></h2>${hint ? `<p class="hint">${hint}</p>` : ''}
    ${list.length ? `<table>${list.map(row).join('')}</table>` : '<p class="hint">Nothing here.</p>'}`;
  const report = state.meta.report || {};
  const sources = SOURCES.map((s) => {
    const r = report[s.name] || {};
    const badge = s.enabled === false ? '<b class="off">not connected</b>' : r.ok === true ? `<b class="ok">${r.count} events</b>` : r.ok === false ? `<b class="err">error</b>` : '<b class="off">not run yet</b>';
    return `<li>${badge} ${esc(s.name)}${r.error ? ` — <small>${esc(r.error)}</small>` : ''}${(r.note || s.note) && (s.enabled === false || !r.count) ? `<br><small>${esc(r.note || s.note)}</small>` : ''}</li>`;
  }).join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>Events review · Valley View</title>
<style>
body{margin:0;background:#121512;color:#E9E4DA;font:15px/1.5 system-ui,sans-serif}main{max-width:1000px;margin:0 auto;padding:32px 16px 80px}
h1{font:400 40px Georgia,serif;margin:0 0 4px}h2{font:400 26px Georgia,serif;margin:40px 0 8px;border-bottom:1px solid #2E332D;padding-bottom:8px}h2 span{color:#D4B47A;font-size:18px}
a{color:#E9E4DA}small,.hint{color:#A8A193}table{width:100%;border-collapse:collapse}td{padding:12px 8px;border-bottom:1px solid #2E332D;vertical-align:top}td.d{white-space:nowrap;width:110px;color:#D4B47A}td.a{white-space:nowrap;text-align:right}
button{font:inherit;font-size:13px;padding:8px 12px;min-height:36px;margin:2px;background:transparent;color:#E9E4DA;border:1px solid #3A4038;cursor:pointer}button:hover{border-color:#D4B47A;color:#D4B47A}
button.primary{background:#D4B47A;color:#121512;border-color:#D4B47A}.flash{background:#1A1E1A;border:1px solid #D4B47A;padding:12px 16px;margin:16px 0}
ul{padding-left:18px}li{margin:6px 0}b.ok{color:#9BC59D}b.err{color:#E39A8E}b.off{color:#8D8779}
fieldset{border:1px solid #2E332D;padding:16px;margin:0}label{display:block;font-size:12px;color:#A8A193;margin:8px 0 4px}input,select{font:inherit;background:#121512;color:#E9E4DA;border:1px solid #2E332D;padding:8px;width:100%;box-sizing:border-box}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px}@media(max-width:640px){td.a{white-space:normal}}
</style></head><body><main>
<h1>Events review</h1>
<p class="hint">Last import: ${esc(state.meta.lastRun || 'never')} · Approved and featured events appear on the site within about 10 minutes.</p>
${flash ? `<div class="flash">${esc(flash)}</div>` : ''}
<form method="post"><button class="primary" name="action" value="import">Run import now</button></form>
${table('New — needs a decision', groups.new, 'Approve to publish, Feature to highlight, Hide to keep it off the site.')}
${table('Featured', groups.featured)}
${table('Approved', groups.approved)}
${groups.auto.length ? table('Auto-approved sources', groups.auto, 'These sources are trusted in EVENTS_AUTO_APPROVE_SOURCES. Hide anything you don’t want.') : ''}
${table('Hidden', groups.hidden)}
<h2>Add an event by hand</h2>
<form method="post"><fieldset><input type="hidden" name="action" value="add">
<div class="grid">
<div><label>Title</label><input name="title" required></div>
<div><label>Start date</label><input type="date" name="start" required></div>
<div><label>End date (optional)</label><input type="date" name="end"></div>
<div><label>Time (optional)</label><input name="time" placeholder="7:00 pm"></div>
<div><label>Town</label><input name="town" placeholder="Lexington"></div>
<div><label>Category</label><select name="category">${CATS.map((c) => `<option>${c}</option>`).join('')}</select></div>
<div><label>Link</label><input type="url" name="url" placeholder="https://"></div>
<div><label>Source label</label><input name="source" placeholder="Van Dusen's"></div>
</div><p><button class="primary" type="submit">Add &amp; publish</button></p></fieldset></form>
<h2>Sources</h2><ul>${sources}</ul>
</main></body></html>`;
}

export default async (req) => {
  if (!authorized(req)) return challenge();
  const store = await getEventsStore();
  let flash = '';
  if (req.method === 'POST') {
    if (!sameOrigin(req)) return new Response('Bad origin', { status: 403 });
    const form = await req.formData();
    const action = form.get('action');
    const state = await loadState(store);
    if (action === 'import') {
      const r = await importAndSave(store);
      flash = `Import finished: ${r.events.length} upcoming events found.`;
    } else if (action === 'add') {
      const title = String(form.get('title') || '').trim();
      const start = String(form.get('start') || '');
      if (title && /^\d{4}-\d{2}-\d{2}$/.test(start)) {
        const source = String(form.get('source') || '').trim() || 'Malcolm & Jess';
        const town = String(form.get('town') || '').trim() || null;
        const url = String(form.get('url') || '');
        const e = {
          id: eventId(source, title, start), title, start,
          end: String(form.get('end') || '') || null, time: String(form.get('time') || '').trim() || null,
          town, minutes: town && MINUTES[town] ? MINUTES[town] : null,
          category: String(form.get('category') || '') || categorize(title), source,
          url: /^https?:\/\//.test(url) ? url : null, manual: true, firstSeen: new Date().toISOString()
        };
        state.candidates[e.id] = e;
        state.decisions[e.id] = 'approved';
        await store.setJSON('candidates', state.candidates);
        await store.setJSON('decisions', state.decisions);
        flash = `Added “${title}”.`;
      } else flash = 'Please give the event a title and start date.';
    } else {
      const id = String(form.get('id') || '');
      if (state.candidates[id] && ['approved', 'featured', 'hidden', 'reset'].includes(action)) {
        if (action === 'reset') delete state.decisions[id]; else state.decisions[id] = action;
        await store.setJSON('decisions', state.decisions);
        flash = `${state.candidates[id].title}: ${action === 'reset' ? 'reset' : action}.`;
      }
    }
  }
  const state = await loadState(store);
  return new Response(page({ state, flash }), {
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' }
  });
};

export const config = { path: '/admin/events' };
