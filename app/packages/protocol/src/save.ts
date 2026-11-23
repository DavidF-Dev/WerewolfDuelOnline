import { contentHash } from '@wwd/engine';
import type { SaveFile } from './messages.js';

/**
 * Serialises JSON data with object keys sorted by UTF-16 code unit and no whitespace, so equal
 * data always gives the same text. Object members whose value is `undefined` are left out and
 * `undefined` array items become `null`, as with `JSON.stringify`.
 */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item: unknown) => (item === undefined ? 'null' : canonicalJson(item))).join(',')}]`;
  }
  if (typeof value === 'object' && value !== null) {
    const record = value as Record<string, unknown>;
    const members = Object.keys(record)
      .filter((key) => record[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`);
    return `{${members.join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

/** The content hash of a save file's fields other than `hash`, in their canonical JSON form. */
export function saveHash(save: Omit<SaveFile, 'hash'> & { hash?: string }): string {
  const { hash: _hash, ...fields } = save;
  return contentHash(canonicalJson(fields));
}
