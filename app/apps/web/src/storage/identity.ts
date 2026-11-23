import type { Backend, DeviceStore, Identity } from './db.js';

const KEY = 'current';

/** The device identity, created with a random id the first time it is read. */
export function createIdentity(backend: Backend): DeviceStore['identity'] {
  return {
    get: async () => {
      const stored = (await backend.get('identity', KEY)) as Identity | undefined;
      if (stored !== undefined) return stored;
      const created: Identity = { deviceId: crypto.randomUUID() };
      await backend.put('identity', KEY, created);
      return created;
    },
    put: (identity) => backend.put('identity', KEY, identity),
  };
}
