import { getDeviceStore } from '../device-store.js';
import type { HistoryRecord } from '../storage/db.js';

/** The finished games kept on this device, newest first; none when they cannot be read. */
export async function listHistory(): Promise<HistoryRecord[]> {
  try {
    return (await getDeviceStore()?.history.list()) ?? [];
  } catch {
    return [];
  }
}
