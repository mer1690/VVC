// GET /api/events → approved upcoming events from the daily import
import { getEventsStore, loadState, publicEvents } from '../lib/events-core.mjs';

export default async () => {
  try {
    const store = await getEventsStore();
    const state = await loadState(store);
    return Response.json({ events: publicEvents(state), updated: state.meta.lastRun || null }, {
      headers: { 'Cache-Control': 'public, max-age=300', 'Netlify-CDN-Cache-Control': 'public, s-maxage=600, stale-while-revalidate=3600' }
    });
  } catch (e) {
    return Response.json({ events: [], error: 'events unavailable' }, { status: 500 });
  }
};

export const config = { path: '/api/events' };
