// Scheduled: runs every morning (~6:15 am Eastern) and refreshes the list of candidate events.
// New events wait in /admin/events for approval unless their source is listed in
// EVENTS_AUTO_APPROVE_SOURCES.
import { getEventsStore, importAndSave } from '../lib/events-core.mjs';

export default async () => {
  const store = await getEventsStore();
  const result = await importAndSave(store);
  console.log('events-import', JSON.stringify(result.report));
};

export const config = { schedule: '15 11 * * *' }; // 11:15 UTC
