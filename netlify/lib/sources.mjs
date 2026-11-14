// Event sources for the daily import.
//
// type:
//   "ical"   — a calendar feed (.ics). Best option when a site offers one.
//   "jsonld" — a web page with schema.org Event data embedded (common on modern sites).
// scope:
//   "venue"  — everything from this source is local; keep all events.
//   "region" — county/tourism-wide feed; keep only events in the towns listed in TOWNS.
// enabled:false entries are known sources that still need a feed URL or a custom reader.
//
// To add a source: copy an entry, set the URL, deploy. Check /admin/events after the next
// run (or press "Run import now") to see whether it returned events.

export const SOURCES = [
  { name: 'Windham Mountain', type: 'jsonld', scope: 'venue', town: 'Windham',
    url: 'https://www.windhammountain.com/visit/events/',
    note: 'No calendar feed. Reads event data from the page; if 0 events appear, it needs a custom reader.' },

  { name: 'Hunter Mountain', type: 'jsonld', scope: 'venue', town: 'Hunter',
    url: 'https://www.huntermtn.com/explore-the-resort/activities/events-and-activities.aspx',
    note: 'URL to confirm on the live site.' },

  { name: 'Belleayre Mountain', type: 'jsonld', scope: 'venue', town: 'Highmount',
    url: 'https://www.belleayre.com/events/',
    note: 'URL to confirm on the live site.' },

  { name: 'Catskill Mountain Foundation', type: 'ical', scope: 'venue', town: 'Hunter',
    url: 'https://www.catskillmtn.org/events/?ical=1',
    note: 'Also carries Catskill Mountain Shakespeare productions in Hunter.' },

  { name: 'Greene County', type: 'ical', scope: 'region',
    url: 'https://greenecountyny.gov/calendar/?ical=1' },

  { name: 'Travel Hudson Valley', type: 'ical', scope: 'region',
    url: 'https://travelhudsonvalley.com/events/category/greene/?ical=1' },

  { name: 'Great Northern Catskills', type: 'jsonld', scope: 'region',
    url: 'https://www.greatnortherncatskills.com/events/all',
    note: 'Greene County tourism. Covers Bearpen Mountain, many town events. No feed — may need a custom reader.' },

  // Known sources that still need a feed URL or a custom reader:
  { name: 'Bearpen Mountain', enabled: false, note: 'Events are listed on Great Northern Catskills (e.g., Oktobearfest).' },
  { name: "Van Dusen's", enabled: false, note: 'No online calendar found. Add shows by hand in /data/events.json.' },
  { name: 'Catskill Mountain Shakespeare', enabled: false, note: 'Covered by Catskill Mountain Foundation and Great Northern Catskills.' },
  { name: 'Town of Lexington', enabled: false, note: 'Find the town calendar URL.' },
  { name: 'Town of Windham', enabled: false, note: 'Find the town calendar URL.' },
  { name: 'Town of Hunter', enabled: false, note: 'Find the town calendar URL.' },
  { name: 'Village of Tannersville', enabled: false, note: 'Find the village calendar URL.' },
  { name: 'Town of Prattsville', enabled: false, note: 'Find the town calendar URL.' },
  { name: 'Town of Stamford', enabled: false, note: 'Delaware County — not covered by the Greene County feeds.' }
];

// Towns we consider "nearby" for region-wide feeds. Extend freely.
export const TOWNS = [
  'Lexington', 'West Kill', 'Westkill', 'Spruceton', 'Jewett', 'East Jewett', 'Maplecrest', 'Windham', 'Hensonville',
  'Ashland', 'Prattsville', 'Hunter', 'Tannersville', 'Haines Falls', 'Elka Park', 'Onteora', 'Halcott',
  'Fleischmanns', 'Highmount', 'Belleayre', 'Big Indian', 'Phoenicia', 'Shandaken', 'Stamford', 'Grand Gorge',
  'Roxbury', 'Gilboa', 'Conesville', 'Bearpen'
];

// Drive times from the chalet, from the Airbnb listing. Add more as you like.
export const MINUTES = { Windham: 20, Hunter: 20, Tannersville: 20, Phoenicia: 20, Highmount: 30, Belleayre: 30 };

// Titles we never want on a guest-facing calendar
export const EXCLUDE = /\b(members?\s*only|member mixer|club members?|instructors?|coaches?|new hire|staff|employees?|certification|clinic and assessment|race training|board meeting|town board|planning board|zoning|public hearing|budget hearing|work session|refresher)\b/i;

const CATEGORY_RULES = [
  ['Ski', /\b(ski|snowboard|snow|slope|terrain park|race|winter carnival|tubing|opening day|closing day)\b/i],
  ['Markets', /\b(market|fair|bazaar|craft show|flea|antique|holiday shop)\b/i],
  ['Theater', /\b(theat(er|re)|shakespeare|play|musical|film|movie|opera|ballet|dance performance|comedy)\b/i],
  ['Music', /\b(concert|music|band|jazz|bluegrass|folk|orchestra|symphony|live at|dj|open mic|festival)\b/i],
  ['Family', /\b(kids?|family|children|santa|easter|story ?time|parade|trick or treat)\b/i],
  ['Outdoors', /\b(hike|trail|bike|biking|paddle|fishing|bird|nature|garden|run|5k|walk)\b/i]
];

export function categorize(text) {
  for (const [cat, re] of CATEGORY_RULES) if (re.test(text)) return cat;
  return 'Community';
}

export function findTown(text) {
  const t = String(text || '');
  for (const town of TOWNS) {
    if (new RegExp('\\b' + town.replace(/ /g, '\\s+') + '\\b', 'i').test(t)) return town === 'Westkill' ? 'West Kill' : town;
  }
  return null;
}
