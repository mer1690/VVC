# Valley View Chalet — direct-booking website

A fast, phone-friendly site in the "Editorial Noir" design. It is plain HTML/CSS/JS (easy to edit) plus a few small Netlify Functions for the parts that need a server.

## What's inside

```
public/                     ← the website (what visitors see)
  index.html                  Home
  gallery.html                Gallery (Indoors → rooms, Outdoors, Winter, Fall, Spring/Summer)
  reviews.html                Reviews (scores + your favorite reviews)
  events.html                 Events calendar (auto-imported + your own picks)
  guide.html                  Area guide
  book.html                   Booking page (slot for your booking-software widget + inquiry form)
  returning.html              Returning-guest code entry
  404.html
  assets/css/site.css         All styling (colors and fonts at the top)
  assets/js/site.js           Calendars, filters, gallery photo list, lightbox
  assets/img/                 Photos (optimized .webp)
  data/events.json            Events you add by hand (always shown)
  data/reviews.json           Reviews you paste in
netlify/functions/          ← server pieces
  availability.mjs            /api/availability — reads your Airbnb calendar so booked dates show
  events.mjs                  /api/events — approved imported events
  events-import.mjs           runs every morning, pulls events from local calendars
  admin-events.mjs            /admin/events — your private page to approve/hide events
  returning-unlock.mjs        checks a returning-guest code on the server
  returning-request.mjs       /returning/request — the private request form (code required)
netlify/lib/                ← shared code (sources list, calendar reader, security)
tests/run.mjs               ← `npm test` checks the server pieces
```

## Put it online (about 15 minutes)

1. **Create a free Netlify account** at netlify.com.
2. **Upload the site.** Easiest long-term: put this folder in a GitHub repository and choose *Add new site → Import an existing project*. (Drag-and-drop works for a quick look, but functions need the Git or CLI route: `npm i -g netlify-cli`, then `netlify deploy --prod` from this folder.)
3. **Add environment variables** under *Site configuration → Environment variables* (see `.env.example`):
   - `AIRBNB_ICAL_URL` — Airbnb → your listing → Availability → *Connect calendars / Export calendar*. Copy the link.
   - `RETURNING_GUEST_CODES` — the code(s) you share with past guests, e.g. `VALLEY-2026`.
   - `RETURNING_SECRET` — any long random string (32+ characters).
   - `ADMIN_PASSWORD` — for `/admin/events`.
   - Optional: `EXTRA_ICAL_URLS`, `RETURNING_RATE_TEXT`, `EVENTS_AUTO_APPROVE_SOURCES`.
4. **Turn on form emails:** *Site configuration → Forms → Form notifications → Add notification → Email*. You'll get an email for every inquiry (`stay-inquiry`) and returning-guest request (`returning-request`).
5. **Connect your domain** under *Domain management*.
6. Redeploy once after adding variables.

## Everyday edits

| To change… | Edit |
|---|---|
| Nightly rate, check-in times, cancellation policy | Search for `[YOUR RATE]`, `[4:00 pm]`, `[Your policy]` in the `.html` files |
| Guide picks | `guide.html` — replace the `[bracketed]` text |
| Add photos | Put the image in `public/assets/img/`, then add one line to the `PHOTOS` list in `assets/js/site.js` (room + season). Rooms without photos show "Photo coming soon". |
| Add reviews | `public/data/reviews.json` (paste real reviews exactly as written, first names only) |
| Add an event by hand | `/admin/events` → *Add an event by hand* (or `public/data/events.json`) |
| Colors and fonts | Top of `assets/css/site.css` |

## Booking software

When you choose your booking tool (OwnerRez, Lodgify, Hospitable…), paste its widget code into the `<div id="booking-widget">` in `book.html`, replacing the "Online booking opens soon" block. Set its colors to background `#121512`, text `#E9E4DA`, accent `#D4B47A`. Add its calendar export link to `EXTRA_ICAL_URLS` so all calendars stay in sync.

## Returning guests

- Guests go to `/returning.html` (or `/welcome-back`) and enter a code.
- The code is checked **on the server** (never visible in the page), attempts are rate-limited, and a signed 7-day session cookie opens `/returning/request`.
- Requests are emailed to you through Netlify Forms and also saved in Netlify Blobs. You then send a Stripe invoice and **block the dates in your booking software / Airbnb**.
- To revoke access, change or remove the code in `RETURNING_GUEST_CODES` (changing `RETURNING_SECRET` also signs everyone out).
- Share codes through your own channels (e.g., email after a direct stay). Airbnb's terms limit steering guests met on Airbnb off the platform — check their current policy.

## Events import

- Runs every morning (~6:15 am Eastern). Sources live in `netlify/lib/sources.mjs`.
- New events wait at `/admin/events` until you **Approve**, **Feature** or **Hide** them. Members-only, staff-training and town-board items are filtered out automatically.
- The admin page shows each source's status. Sources marked "not connected" (Van Dusen's, town websites, Stamford) still need a calendar link or a custom reader; add those events by hand meanwhile.
- Some sources haven't been tested against their live sites yet — check the admin page after the first run and send me any that show 0 events or an error.

## Test locally

```
npm install
npm test            # checks calendar parsing, code check, filters
npx netlify dev     # runs the full site with functions at http://localhost:8888
```
