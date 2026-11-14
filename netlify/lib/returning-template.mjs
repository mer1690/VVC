// Private returning-guest page (served only after the code is verified on the server).
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function renderReturningPage({ sent = false, error = '', values = {}, rate } = {}) {
  const v = (k) => esc(values[k] || '');
  const body = sent ? `
    <div class="card-panel stack" style="width: 100%; max-width: 560px; text-align: center; gap: 20px;">
      <p class="eyebrow">Request received</p>
      <h1 style="font-size: 48px;">Thank you. We'll be in touch shortly.</h1>
      <p class="card__text">Watch your inbox for a confirmation and a secure Stripe invoice. Your dates are held once it's paid.</p>
      <p class="serif brass" style="font-size: 22px;">— Malcolm &amp; Jess</p>
      <p><a class="link-caps" href="/">Back to the chalet</a></p>
    </div>` : `
    <form class="card-panel form" style="width: 100%; max-width: 760px;" method="POST" action="/returning/request">
      <p class="sr-only"><label>Leave this empty <input name="company" tabindex="-1" autocomplete="off"></label></p>
      <div class="stack" style="gap: 12px;">
        <p class="eyebrow">Returning-guest request</p>
        <h1 style="font-size: 48px;">Tell us when you'd like to come back.</h1>
        <p class="card__text">We'll check the calendar, confirm your dates and send a secure Stripe invoice. Your dates are held once it's paid.</p>
      </div>
      ${error ? `<p class="form-msg" role="alert">${esc(error)}</p>` : ''}
      <div class="form-grid form-grid--3">
        <label class="input">Arrive<input type="date" name="arrive" required value="${v('arrive')}"></label>
        <label class="input">Depart<input type="date" name="depart" required value="${v('depart')}"></label>
        <label class="input">Guests<input type="text" name="guests" placeholder="e.g. 6 adults, 2 children" value="${v('guests')}"></label>
      </div>
      <div class="form-grid">
        <label class="input">Full name<input type="text" name="name" autocomplete="name" required value="${v('name')}"></label>
        <label class="input">Email<input type="email" name="email" autocomplete="email" required value="${v('email')}"></label>
        <label class="input">Phone<input type="tel" name="phone" autocomplete="tel" value="${v('phone')}"></label>
        <label class="input">Bringing a pet?<select name="pet"><option>No</option><option>Yes, one dog</option><option>Yes, two dogs</option></select></label>
      </div>
      <label class="input">Anything we should know?<textarea name="message" rows="4">${v('message')}</textarea></label>
      <div style="display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 16px; padding-top: 8px; border-top: 1px solid var(--line);">
        <span class="muted" style="font-size: 13px;">${esc(rate || 'Returning-guest rate shared on confirmation')}</span>
        <button class="btn" type="submit" style="min-height: 60px; padding: 0 40px;">Send request</button>
      </div>
    </form>`;
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex">
<title>Returning guests · Valley View Chalet</title>
<link rel="icon" href="/assets/img/favicon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;1,400&family=Jost:wght@300;400;500&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/assets/css/site.css"></head>
<body>
<header class="site-header">
  <a class="logo" href="/">Valley View Chalet</a>
  <span class="room__detail" style="margin-left: auto;">Private · returning guests</span>
</header>
<div class="returning">
  <img src="/assets/img/aerial-night.webp" alt="The chalet lit up at night in the snow">
  <main>${body}</main>
</div>
</body></html>`;
}
