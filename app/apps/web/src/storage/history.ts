import type { Backend, DeviceStore, HistoryRecord } from './db.js';

/** Finished games, newest first. */
export function createHistory(backend: Backend): DeviceStore['history'] {
  return {
    list: async () => {
      const records = (await backend.getAll('history')) as HistoryRecord[];
      return records.sort((a, b) => b.finishedAt - a.finishedAt);
    },
    get: async (id) => (await backend.get('history', id)) as HistoryRecord | undefined,
    put: (record) => backend.put('history', record.id, record),
    delete: (id) => backend.delete('history', id),
    clear: () => backend.clear('history'),
  };
}
