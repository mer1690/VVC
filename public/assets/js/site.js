/* Valley View Chalet — site scripts (no dependencies) */
(function () {
  'use strict';

  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };
  var MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  var DOW = ['SUN','MON','TUE','WED','THU','FRI','SAT'];

  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function ymd(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function parseYmd(s) { var p = String(s).slice(0, 10).split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function todayYmd() { return ymd(new Date()); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function safeUrl(u) { return /^https?:\/\//i.test(u || '') ? u : '#'; }
  function getJSON(url) {
    return fetch(url, { headers: { Accept: 'application/json' } }).then(function (r) {
      if (!r.ok) throw new Error(url + ' ' + r.status);
      return r.json();
    });
  }

  /* ---------- Mobile menu ---------- */
  var toggle = $('.menu-toggle');
  if (toggle) {
    toggle.addEventListener('click', function () {
      var nav = document.getElementById(toggle.getAttribute('aria-controls'));
      var open = nav.classList.toggle('is-open');
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    });
  }

  /* ---------- Booking bar ---------- */
  $$('[data-booking-bar]').forEach(function (form) {
    var a = form.querySelector('[name=arrive]');
    var d = form.querySelector('[name=depart]');
    if (!a || !d) return;
    var t = todayYmd();
    a.min = t; d.min = t;
    var q = new URLSearchParams(location.search);
    if (q.get('arrive')) a.value = q.get('arrive');
    if (q.get('depart')) d.value = q.get('depart');
    if (q.get('guests') && form.querySelector('[name=guests]')) form.querySelector('[name=guests]').value = q.get('guests');
    a.addEventListener('change', function () {
      if (!a.value) return;
      var next = parseYmd(a.value); next.setDate(next.getDate() + 1);
      d.min = ymd(next);
      if (!d.value || d.value <= a.value) { var three = parseYmd(a.value); three.setDate(three.getDate() + 3); d.value = ymd(three); }
    });
  });

  /* ---------- Availability ---------- */
  var availabilityPromise = null;
  function loadAvailability() {
    if (!availabilityPromise) {
      availabilityPromise = getJSON('/api/availability').then(function (data) {
        return { ok: true, booked: (data && data.booked) || [] };
      }).catch(function () { return { ok: false, booked: [] }; });
    }
    return availabilityPromise;
  }
  function isBooked(ranges, day) {
    for (var i = 0; i < ranges.length; i++) {
      // ranges are [start, end) — end is the checkout day, which is free for a new arrival
      if (day >= ranges[i][0] && day < ranges[i][1]) return true;
    }
    return false;
  }

  /* ---------- Calendar component ---------- */
  function Calendar(el, opts) {
    this.el = el;
    this.opts = opts || {};
    var now = new Date();
    this.year = now.getFullYear();
    this.month = now.getMonth();
    this.minYear = this.year; this.minMonth = this.month;
    this.booked = [];
    this.eventDays = {};
    this.note = '';
    this.render();
  }
  Calendar.prototype.render = function () {
    var self = this;
    var first = new Date(this.year, this.month, 1);
    var days = new Date(this.year, this.month + 1, 0).getDate();
    var t = todayYmd();
    var atMin = this.year === this.minYear && this.month === this.minMonth;
    var html = '<div class="cal"><div class="cal__head">' +
      '<button class="cal__nav" type="button" data-prev aria-label="Previous month"' + (atMin ? ' disabled' : '') + '>‹</button>' +
      '<span class="cal__title" aria-live="polite">' + MONTHS[this.month] + ' ' + this.year + '</span>' +
      '<button class="cal__nav" type="button" data-next aria-label="Next month">›</button></div>' +
      '<div class="cal__grid" role="grid">';
    ['S','M','T','W','T','F','S'].forEach(function (d) { html += '<span class="cal__dow" aria-hidden="true">' + d + '</span>'; });
    for (var b = 0; b < first.getDay(); b++) html += '<span></span>';
    var sel = this.sel || {};
    for (var i = 1; i <= days; i++) {
      var key = this.year + '-' + pad(this.month + 1) + '-' + pad(i);
      var cls = 'cal__day';
      var label = MONTHS[this.month] + ' ' + i;
      var past = key < t;
      var booked = !past && isBooked(this.booked, key);
      if (past) { cls += ' cal__day--past'; }
      else if (booked) { cls += ' cal__day--booked'; label += ', booked'; }
      if (this.eventDays[key]) { cls += ' cal__day--event'; label += ', ' + this.eventDays[key] + ' event' + (this.eventDays[key] > 1 ? 's' : ''); }
      if (key === t) cls += ' cal__day--today';
      var isSel = key === sel.start || key === sel.end;
      if (isSel) cls += ' cal__day--sel';
      else if (sel.start && sel.end && key > sel.start && key < sel.end) cls += ' cal__day--range';
      // Which days can be clicked: in "select" mode, any future day that is free (a booked day
      // can still be a checkout day, which the click handler checks); otherwise any future day.
      var clickable = this.opts.onDay && !past && (!this.opts.select || !booked || (sel.start && !sel.end && key > sel.start));
      if (clickable) {
        html += '<button type="button" class="' + cls + '" data-day="' + key + '" aria-label="' + esc(label) + '" aria-pressed="' + isSel + '">' + i + '</button>';
      } else {
        html += '<span class="' + cls + '" aria-label="' + esc(label) + '">' + i + '</span>';
      }
    }
    html += '</div><div class="cal__legend">';
    if (this.opts.events) html += '<span><span class="brass">●</span> Event</span><span><span style="color: var(--dim)">●</span> Chalet booked</span>';
    else html += '<span><span style="text-decoration: line-through">Booked</span></span><span>Open</span>';
    html += '</div>' + (this.opts.hint ? '<p class="cal__note">' + esc(this.opts.hint) + '</p>' : '') +
      (this.note ? '<p class="cal__note">' + esc(this.note) + '</p>' : '') + '</div>';
    this.el.innerHTML = html;
    var prev = this.el.querySelector('[data-prev]');
    var next = this.el.querySelector('[data-next]');
    prev.addEventListener('click', function () { self.shift(-1); });
    next.addEventListener('click', function () { self.shift(1); });
    $$('[data-day]', this.el).forEach(function (b) {
      b.addEventListener('click', function () {
        var day = b.getAttribute('data-day');
        self.opts.onDay(day);
        var again = self.el.querySelector('[data-day="' + day + '"]');
        if (again) again.focus();
      });
    });
  };
  Calendar.prototype.showMonthOf = function (ymdStr) {
    var d = parseYmd(ymdStr);
    if (d < new Date(this.minYear, this.minMonth, 1)) return;
    this.year = d.getFullYear(); this.month = d.getMonth();
  };
  Calendar.prototype.shift = function (n) {
    var d = new Date(this.year, this.month + n, 1);
    if (d < new Date(this.minYear, this.minMonth, 1)) return;
    this.year = d.getFullYear(); this.month = d.getMonth();
    this.render();
    if (this.opts.onChange) this.opts.onChange(this.year, this.month);
  };

  $$('[data-calendar]').forEach(function (el) {
    var formSel = el.getAttribute('data-select-form');
    var form = formSel ? document.querySelector(formSel) : null;
    var cal = new Calendar(el, {
      events: el.hasAttribute('data-event-markers'),
      select: !!form,
      hint: form ? 'Tap your arrival date, then your departure date.' : ''
    });
    el._calendar = cal;
    if (form) wireDatePicker(cal, form);
    loadAvailability().then(function (res) {
      cal.booked = res.booked;
      if (!res.ok) cal.note = 'Live availability appears here once the Airbnb calendar is connected.';
      cal.render();
    });
  });

  // Click arrival then departure on the calendar → fills the form's Arrive/Depart fields (and back).
  function wireDatePicker(cal, form) {
    var a = form.querySelector('[name=arrive]');
    var d = form.querySelector('[name=depart]');
    var msg = document.createElement('p');
    msg.className = 'cal__note cal__note--warn';
    msg.setAttribute('role', 'status');
    cal.sel = { start: a.value || null, end: d.value || null };
    var nightsFree = function (start, end) {
      // every night from arrival up to (not including) departure must be open
      var x = parseYmd(start), last = parseYmd(end);
      while (x < last) { if (isBooked(cal.booked, ymd(x))) return false; x.setDate(x.getDate() + 1); }
      return true;
    };
    var sync = function () {
      a.value = cal.sel.start || '';
      d.value = cal.sel.end || '';
      if (a.value) { var n = parseYmd(a.value); n.setDate(n.getDate() + 1); d.min = ymd(n); }
    };
    cal.opts.onDay = function (day) {
      var s = cal.sel;
      var warn = '';
      if (!s.start || s.end || day <= s.start) {
        if (isBooked(cal.booked, day)) { warn = 'That night is already booked — please pick another arrival date.'; }
        else { cal.sel = { start: day, end: null }; }
      } else if (nightsFree(s.start, day)) {
        cal.sel = { start: s.start, end: day };
      } else {
        warn = 'Some nights in that range are booked. Please choose different dates.';
        cal.sel = isBooked(cal.booked, day) ? { start: null, end: null } : { start: day, end: null };
      }
      sync();
      cal.render();
      msg.textContent = warn;
      cal.el.querySelector('.cal').appendChild(msg);
    };
    var fromInputs = function () {
      cal.sel = { start: a.value || null, end: d.value && d.value > a.value ? d.value : null };
      if (a.value) cal.showMonthOf(a.value);
      cal.render();
    };
    a.addEventListener('change', fromInputs);
    d.addEventListener('change', fromInputs);
    if (a.value) cal.showMonthOf(a.value);
  }

  /* ---------- Events ---------- */
  var CATEGORY_ORDER = ['All', 'Ski', 'Community', 'Markets', 'Music', 'Theater', 'Family', 'Outdoors'];
  function loadEvents() {
    var live = getJSON('/api/events').then(function (d) { return d.events || []; }).catch(function () { return []; });
    var manual = getJSON('/data/events.json').then(function (d) { return d.events || []; }).catch(function () { return []; });
    return Promise.all([live, manual]).then(function (lists) {
      var seen = {}, out = [];
      lists[1].concat(lists[0]).forEach(function (e) {
        if (!e || !e.title || !e.start) return;
        var key = (e.title + '|' + e.start.slice(0, 10)).toLowerCase().replace(/[^a-z0-9|]/g, '');
        if (seen[key]) return;
        seen[key] = true;
        out.push(e);
      });
      var t = todayYmd();
      out = out.filter(function (e) { return (e.end || e.start).slice(0, 10) >= t; });
      out.sort(function (a, b) { return a.start < b.start ? -1 : a.start > b.start ? 1 : 0; });
      return out;
    });
  }
  function eventMeta(e) {
    var bits = [e.category, e.town, e.minutes ? 'about ' + e.minutes + ' min' : null].filter(Boolean);
    return bits.join(' · ');
  }
  function eventDateParts(e) {
    var d = parseYmd(e.start);
    var label = pad(d.getDate());
    var sub = DOW[d.getDay()];
    if (e.end && e.end.slice(0, 10) !== e.start.slice(0, 10)) {
      var d2 = parseYmd(e.end);
      sub += '–' + (d2.getMonth() === d.getMonth() ? d2.getDate() : MONTHS[d2.getMonth()].slice(0, 3) + ' ' + d2.getDate());
    }
    if (e.time) sub += ' · ' + e.time;
    return { day: label, sub: sub };
  }
  function eventHTML(e) {
    var p = eventDateParts(e);
    return '<article class="event"><div class="event__d">' + p.day + '<span>' + esc(p.sub) + '</span></div>' +
      '<div class="stack" style="gap: 8px;"><span class="event__meta">' + esc(eventMeta(e)) + '</span>' +
      '<span class="event__title">' + esc(e.title) + '</span>' +
      (e.note ? '<span class="card__text">' + esc(e.note) + '</span>' : '') +
      (e.source ? '<span class="event__src">via <a class="brass" href="' + esc(safeUrl(e.url)) + '" target="_blank" rel="noopener">' + esc(e.source) + '</a> · details &amp; times on the source site</span>' : '') +
      '</div></article>';
  }

  // Home preview
  $$('[data-events-preview]').forEach(function (el) {
    var limit = +el.getAttribute('data-limit') || 3;
    loadEvents().then(function (events) {
      if (!events.length) { el.innerHTML = '<p class="empty-note">New events are added every week. <a class="brass" href="/events.html">See the events calendar</a>.</p>'; return; }
      el.innerHTML = events.slice(0, limit).map(function (e) {
        var d = parseYmd(e.start);
        return '<div class="row"><span class="row__date">' + MONTHS[d.getMonth()].slice(0, 3) + ' ' + d.getDate() + '</span>' +
          '<span class="row__title">' + esc(e.title) + '</span><span class="row__meta">' + esc(e.town ? e.town + (e.minutes ? ' · ' + e.minutes + ' min' : '') : '') + '</span></div>';
      }).join('');
    });
  });

  // Events page
  var eventsRoot = $('[data-events-page]');
  if (eventsRoot) {
    var state = { cat: 'All', sources: null };
    var allEvents = [];
    var listEl = $('[data-events-list]', eventsRoot);
    var catEl = $('[data-event-cats]', eventsRoot);
    var srcEl = $('[data-event-sources]', eventsRoot);
    var countEl = $('[data-source-count]', eventsRoot);
    var calEl = $('[data-calendar]', eventsRoot);

    var dayLabel = function (k) { var d = parseYmd(k); return DOW[d.getDay()].charAt(0) + DOW[d.getDay()].slice(1).toLowerCase() + ', ' + MONTHS[d.getMonth()].slice(0, 3) + ' ' + d.getDate(); };
    var onDayEl = function (e, k) { return e.start.slice(0, 10) <= k && (e.end || e.start).slice(0, 10) >= k; };

    // Clicking a day on the calendar shows just that day's events; click it again to show all
    if (calEl && calEl._calendar) {
      calEl._calendar.opts.onDay = function (k) {
        state.day = state.day === k ? null : k;
        calEl._calendar.sel = state.day ? { start: state.day } : null;
        renderEvents();
        if (state.day && window.innerWidth < 1000) listEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
      };
    }

    var renderEvents = function () {
      var byFilters = allEvents.filter(function (e) {
        return (state.cat === 'All' || e.category === state.cat) && (!state.sources || state.sources[e.source || 'Malcolm & Jess'] !== false);
      });
      var shown = state.day ? byFilters.filter(function (e) { return onDayEl(e, state.day); }) : byFilters;
      // calendar markers
      if (calEl && calEl._calendar) {
        var marks = {};
        byFilters.forEach(function (e) {
          var d = parseYmd(e.start), end = parseYmd(e.end || e.start), n = 0;
          while (d <= end && n < 60) { var k = ymd(d); marks[k] = (marks[k] || 0) + 1; d.setDate(d.getDate() + 1); n++; }
        });
        calEl._calendar.eventDays = marks;
        calEl._calendar.render();
      }
      var dayBar = state.day ? '<div class="day-filter"><span>Showing ' + esc(dayLabel(state.day)) + '</span><button class="link-caps" type="button" data-clear-day>Show all dates</button></div>' : '';
      var bindClear = function () { var c = listEl.querySelector('[data-clear-day]'); if (c) c.addEventListener('click', function () { state.day = null; calEl._calendar.sel = null; renderEvents(); }); };
      if (!shown.length) { listEl.innerHTML = dayBar + '<p class="empty-note">' + (state.day ? 'Nothing listed for this day yet.' : 'No upcoming events match these filters yet. Check back soon.') + '</p>'; bindClear(); return; }
      var groups = {}, order = [];
      shown.forEach(function (e) {
        var d = parseYmd(e.start), k = d.getFullYear() + '-' + pad(d.getMonth() + 1);
        if (!groups[k]) { groups[k] = { label: MONTHS[d.getMonth()] + (d.getFullYear() !== new Date().getFullYear() ? ' ' + d.getFullYear() : ''), items: [] }; order.push(k); }
        groups[k].items.push(e);
      });
      listEl.innerHTML = dayBar + order.map(function (k) {
        return '<div class="month-group"><h2 style="font-size: 40px; margin-bottom: 8px;">' + esc(groups[k].label) + '</h2>' + groups[k].items.map(eventHTML).join('') + '</div>';
      }).join('');
      bindClear();
    };

    var renderFilters = function () {
      var cats = CATEGORY_ORDER.filter(function (c) { return c === 'All' || allEvents.some(function (e) { return e.category === c; }); });
      catEl.innerHTML = cats.map(function (c) { return '<button class="chip" type="button" aria-pressed="' + (c === state.cat) + '" data-cat="' + esc(c) + '">' + esc(c) + '</button>'; }).join('');
      $$('[data-cat]', catEl).forEach(function (b) { b.addEventListener('click', function () { state.cat = b.getAttribute('data-cat'); renderFilters(); renderEvents(); }); });
      if (srcEl && !srcEl.hasAttribute('data-static')) {
        var names = {};
        allEvents.forEach(function (e) { names[e.source || 'Malcolm & Jess'] = true; });
        if (!state.sources) { state.sources = {}; Object.keys(names).forEach(function (n) { state.sources[n] = true; }); }
      }
    };

    // Source toggles (static list rendered in HTML; toggling hides events from that source)
    $$('[data-source]', eventsRoot).forEach(function (b) {
      b.addEventListener('click', function () {
        state.sources = state.sources || {};
        var name = b.getAttribute('data-source');
        var on = b.getAttribute('aria-pressed') !== 'false';
        b.setAttribute('aria-pressed', on ? 'false' : 'true');
        state.sources[name] = !on;
        // Map grouped town buttons to multiple sources
        (b.getAttribute('data-aliases') || '').split('|').filter(Boolean).forEach(function (a) { state.sources[a] = !on; });
        renderEvents();
      });
    });

    loadEvents().then(function (events) {
      allEvents = events;
      if (countEl) countEl.textContent = events.length + ' upcoming';
      renderFilters();
      renderEvents();
    });
  }

  /* ---------- Gallery ---------- */
  var galleryRoot = $('[data-gallery]');
  if (galleryRoot) {
    var IMG = '/assets/img/';
    var ROOMS = [
      { id: 'Bedroom 1', title: 'Bedroom 1', detail: 'Upper level · queen · en suite bath' },
      { id: 'Bedroom 2', title: 'Bedroom 2 · The Green Room', detail: 'Upper level · queen' },
      { id: 'Bedroom 3', title: 'Bedroom 3', detail: 'Lower level · 2 doubles, 2 singles, crib' },
      { id: 'Bathroom 1', title: 'Bathroom 1', detail: 'En suite to Bedroom 1' },
      { id: 'Bathroom 2', title: 'Bathroom 2', detail: 'Upper level · full bath' },
      { id: 'Bathroom 3', title: 'Bathroom 3', detail: 'Lower level · full bath' },
      { id: 'Living room 1', title: 'Living room 1 · The great room', detail: 'Upper level · vaulted cedar ceiling · fireplace' },
      { id: 'Living room 2', title: 'Living room 2', detail: 'Lower level · games · record player' },
      { id: 'Dining room', title: 'Dining room', detail: 'Seats ten · under the antler chandelier' },
      { id: 'Kitchen', title: 'Kitchen', detail: 'Fully equipped · island seating' }
    ];
    // To add photos: drop the file in /assets/img and add a line here.
    // place: a room id above, or "Outdoors". seasons: any of Winter, Fall, Spring/Summer.
    var PHOTOS = [
      { file: 'hero-winter-sunset.webp', caption: 'Deck at winter sunset', alt: 'Snowy deck with hot tub and firepit at winter sunset', place: 'Outdoors', seasons: ['Winter'], big: true },
      { file: 'great-room.webp', caption: 'Great room', alt: 'Great room with vaulted cedar ceiling, antler chandelier and stone fireplace', place: 'Living room 1', seasons: ['Winter'] },
      { file: 'kitchen.webp', caption: 'Kitchen', alt: 'Kitchen with forest-green cabinets, brass pulls and a large island', place: 'Kitchen', seasons: ['Winter'] },
      { file: 'bedroom-1.webp', caption: 'Bedroom 1', alt: 'Bedroom 1 with doors to the snowy deck and the valley', place: 'Bedroom 1', seasons: ['Winter'] },
      { file: 'hottub-sunset.webp', caption: 'Hot tub at sunset', alt: 'Hot tub on the patio at sunset', place: 'Outdoors', seasons: ['Spring/Summer'] },
      { file: 'deck-firepit-sunset.webp', caption: 'Deck firepit', alt: 'Deck firepit beside the hot tub at dusk', place: 'Outdoors', seasons: ['Spring/Summer'], big: true },
      { file: 'hottub-fall.webp', caption: 'Fall foliage', alt: 'Fall foliage around the hot tub', place: 'Outdoors', seasons: ['Fall'] },
      { file: 'patio-view.webp', caption: 'Patio view', alt: 'Two chairs on the patio facing the valley', place: 'Outdoors', seasons: ['Spring/Summer'] },
      { file: 'firepit-snow.webp', caption: 'Firepit, first snow', alt: 'Firepit burning in the snow at blue hour', place: 'Outdoors', seasons: ['Winter'] },
      { file: 'deck-snowfall.webp', caption: 'Snowfall on the deck', alt: 'Snow falling on the deck chairs', place: 'Outdoors', seasons: ['Winter'] },
      { file: 'aerial-day.webp', caption: 'From above', alt: 'Aerial view of the chalet in snow', place: 'Outdoors', seasons: ['Winter'] },
      { file: 'aerial-night.webp', caption: 'Evening glow', alt: 'The chalet lit up at night in the snow', place: 'Outdoors', seasons: ['Winter'] }
    ];
    var gState = { tab: 'All', room: 'All rooms' };
    var tabsEl = $('[data-gallery-tabs]', galleryRoot);
    var roomsEl = $('[data-gallery-rooms]', galleryRoot);
    var countG = $('[data-gallery-count]', galleryRoot);
    var bodyEl = $('[data-gallery-body]', galleryRoot);
    var current = [];

    var tileHTML = function (p, i, allowBig) {
      return '<button type="button" class="tile' + (allowBig && p.big ? ' tile--big' : '') + '" data-lb="' + i + '" aria-label="Open photo: ' + esc(p.caption) + '">' +
        '<img src="' + IMG + esc(p.file) + '" alt="' + esc(p.alt) + '" loading="lazy"><span class="cap">' + esc(p.caption) + '</span></button>';
    };
    var renderGallery = function () {
      var tabs = ['All', 'Indoors', 'Outdoors', 'Winter', 'Fall', 'Spring/Summer'];
      tabsEl.innerHTML = tabs.map(function (t) { return '<button class="chip" type="button" aria-pressed="' + (t === gState.tab) + '" data-tab="' + t + '">' + t + '</button>'; }).join('');
      $$('[data-tab]', tabsEl).forEach(function (b) { b.addEventListener('click', function () { gState.tab = b.getAttribute('data-tab'); gState.room = 'All rooms'; renderGallery(); }); });

      roomsEl.hidden = gState.tab !== 'Indoors';
      if (gState.tab === 'Indoors') {
        roomsEl.innerHTML = '<span class="room__detail" style="margin-right: 4px;">Rooms</span>' + ['All rooms'].concat(ROOMS.map(function (r) { return r.id; })).map(function (r) {
          return '<button class="subchip" type="button" aria-pressed="' + (r === gState.room) + '" data-room="' + esc(r) + '">' + esc(r) + '</button>';
        }).join('');
        $$('[data-room]', roomsEl).forEach(function (b) { b.addEventListener('click', function () { gState.room = b.getAttribute('data-room'); renderGallery(); }); });
        var rooms = ROOMS.filter(function (r) { return gState.room === 'All rooms' || r.id === gState.room; });
        current = [];
        bodyEl.innerHTML = rooms.map(function (r) {
          var ps = PHOTOS.filter(function (p) { return p.place === r.id; });
          var tiles = ps.map(function (p) { current.push(p); return tileHTML(p, current.length - 1, false); }).join('');
          for (var k = ps.length; k < 3; k++) tiles += '<div class="tile-empty">Photo coming soon</div>';
          return '<div class="room"><div class="room__head"><h2>' + esc(r.title) + '</h2><span class="room__detail">' + esc(r.detail) + '</span></div><div class="gallery-grid">' + tiles + '</div></div>';
        }).join('');
      } else {
        current = PHOTOS.filter(function (p) {
          if (gState.tab === 'All') return true;
          if (gState.tab === 'Outdoors') return p.place === 'Outdoors';
          return p.seasons.indexOf(gState.tab) >= 0;
        });
        bodyEl.innerHTML = '<div class="gallery-grid" style="padding-top: 40px;">' + current.map(function (p, i) { return tileHTML(p, i, gState.tab === 'All'); }).join('') + '</div>';
      }
      countG.textContent = current.length + (current.length === 1 ? ' photo' : ' photos');
      $$('[data-lb]', bodyEl).forEach(function (b) { b.addEventListener('click', function () { openLightbox(+b.getAttribute('data-lb')); }); });
    };

    // Lightbox
    var lb = $('[data-lightbox]');
    var lbImg = lb && $('img', lb), lbCap = lb && $('.lightbox__cap', lb), lbIndex = 0, lastFocus = null;
    var showLb = function () { var p = current[lbIndex]; lbImg.src = IMG + p.file; lbImg.alt = p.alt; lbCap.textContent = p.caption + ' · ' + (lbIndex + 1) + ' / ' + current.length; };
    var openLightbox = function (i) { if (!lb) return; lastFocus = document.activeElement; lbIndex = i; showLb(); lb.classList.add('is-open'); $('.lightbox__close', lb).focus(); };
    var closeLightbox = function () { lb.classList.remove('is-open'); if (lastFocus) lastFocus.focus(); };
    if (lb) {
      $('.lightbox__close', lb).addEventListener('click', closeLightbox);
      $('.lightbox__prev', lb).addEventListener('click', function () { lbIndex = (lbIndex - 1 + current.length) % current.length; showLb(); });
      $('.lightbox__next', lb).addEventListener('click', function () { lbIndex = (lbIndex + 1) % current.length; showLb(); });
      lb.addEventListener('click', function (e) { if (e.target === lb) closeLightbox(); });
      lb.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') closeLightbox();
        if (e.key === 'ArrowLeft') $('.lightbox__prev', lb).click();
        if (e.key === 'ArrowRight') $('.lightbox__next', lb).click();
      });
    }
    renderGallery();
  }

  /* ---------- Reviews ---------- */
  var reviewsRoot = $('[data-reviews]');
  if (reviewsRoot) {
    var TAGS = [['All', 177], ['Hospitality', 102], ['View', 57], ['Cleanliness', 53], ['Hot tub', 50], ['Family', 49], ['Comfort', 45], ['Indoor spaces', 43], ['Amenities', 40], ['Decor', 37], ['Hiking', 7]];
    var rState = { tag: 'All' }, reviews = [];
    var tagEl = $('[data-review-tags]', reviewsRoot), listR = $('[data-review-list]', reviewsRoot), headR = $('[data-review-heading]', reviewsRoot);
    var renderReviews = function () {
      tagEl.innerHTML = TAGS.map(function (t) { return '<button class="chip" style="text-transform: none; letter-spacing: 0;" type="button" aria-pressed="' + (t[0] === rState.tag) + '" data-tag="' + esc(t[0]) + '">' + esc(t[0]) + ' <span style="opacity: .7">' + t[1] + '</span></button>'; }).join('');
      $$('[data-tag]', tagEl).forEach(function (b) { b.addEventListener('click', function () { rState.tag = b.getAttribute('data-tag'); renderReviews(); }); });
      headR.textContent = rState.tag === 'All' ? 'Favorite stays' : 'Guests on: ' + rState.tag;
      var shown = reviews.filter(function (r) { return rState.tag === 'All' || (r.tags || []).indexOf(rState.tag) >= 0; });
      if (!shown.length) {
        listR.innerHTML = '<p class="empty-note" style="grid-column: 1 / -1;">Guest reviews for this topic are coming soon. In the meantime, <a class="brass" href="https://www.airbnb.com/h/valleyviewchaletcatskills" target="_blank" rel="noopener">read all 177 on Airbnb</a>.</p>';
        return;
      }
      listR.innerHTML = shown.map(function (r) {
        return '<article class="review"><span class="brass" style="font-size: 14px; letter-spacing: .2em;" aria-label="' + (r.rating || 5) + ' stars">' + '★★★★★'.slice(0, r.rating || 5) + '</span>' +
          '<p class="review__text">“' + esc(r.text) + '”</p><div class="review__by"><span>' + esc(r.name) + '</span><span>' + esc(r.date) + '</span></div></article>';
      }).join('');
    };
    getJSON('/data/reviews.json').then(function (d) { reviews = d.reviews || []; }).catch(function () {}).then(renderReviews);
  }

  /* ---------- Netlify form helper (AJAX submit with graceful fallback) ---------- */
  $$('form[data-netlify-ajax]').forEach(function (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var msg = form.querySelector('.form-msg');
      var data = new URLSearchParams(new FormData(form)).toString();
      fetch('/', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: data })
        .then(function (r) {
          if (!r.ok) throw new Error();
          form.reset();
          if (msg) msg.textContent = 'Thank you — we’ll reply shortly.';
        })
        .catch(function () { if (msg) msg.textContent = 'Something went wrong. Please email us instead.'; });
    });
  });

  /* ---------- Returning guests: show error after a wrong code ---------- */
  var gate = $('[data-returning-gate]');
  if (gate) {
    var qs = new URLSearchParams(location.search);
    var err = $('.form-msg', gate);
    if (qs.get('error') === 'code' && err) err.textContent = 'That code didn’t match. Please check it and try again.';
    if (qs.get('error') === 'expired' && err) err.textContent = 'Your session expired. Please enter your code again.';
    if (qs.get('error') === 'busy' && err) err.textContent = 'Too many attempts. Please wait a few minutes and try again.';
  }

  /* ---------- Book page: summary from the booking bar ---------- */
  var summary = $('[data-stay-summary]');
  if (summary) {
    var q2 = new URLSearchParams(location.search);
    if (q2.get('arrive') && q2.get('depart')) {
      var n = Math.round((parseYmd(q2.get('depart')) - parseYmd(q2.get('arrive'))) / 864e5);
      if (n > 0) summary.textContent = n + ' night' + (n > 1 ? 's' : '') + ' · ' + q2.get('arrive') + ' → ' + q2.get('depart') + (q2.get('guests') ? ' · ' + q2.get('guests') + ' guests' : '');
    }
  }
})();
