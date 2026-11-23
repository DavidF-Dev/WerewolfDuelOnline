import { afterEach, describe, expect, it, vi } from 'vitest';
import { prepareDevice } from '../src/device.js';
import * as db from '../src/storage/db.js';

afterEach(() => vi.restoreAllMocks());

describe('prepareDevice', () => {
  it('failing settings read still mounts with defaults', async () => {
    const store = await db.openDeviceStore();
    vi.spyOn(store.settings, 'get').mockRejectedValue(new Error('unreadable'));
    vi.spyOn(db, 'openDeviceStore').mockResolvedValue(store);
    const root = document.createElement('div');
    await expect(prepareDevice(root)).resolves.toBeUndefined();
    expect(root.getAttribute('data-theme')).toBeTruthy();
    expect(root.style.getPropertyValue('--text-scale')).toBe('1');
  });

  it('survives the store failing to open at all', async () => {
    vi.spyOn(db, 'openDeviceStore').mockRejectedValue(new Error('broken'));
    const root = document.createElement('div');
    await expect(prepareDevice(root)).resolves.toBeUndefined();
    expect(root.getAttribute('data-font')).toBe('default');
  });
});
