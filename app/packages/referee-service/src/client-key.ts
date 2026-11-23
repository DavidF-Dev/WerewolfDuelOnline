const MAPPED_IPV4 = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i;
const HEXTET = /^[0-9a-f]{1,4}$/;
const IPV6_GROUPS = 8;
const PREFIX_GROUPS = 4;

/** Expands an IPv6 address to its eight hextets, or returns null if it is not one. */
function hextets(address: string): string[] | null {
  const halves = address.split('::');
  if (halves.length > 2) return null;
  const head = halves[0] === '' ? [] : halves[0]!.split(':');
  const tail = halves.length === 1 || halves[1] === '' ? [] : halves[1]!.split(':');
  const missing = IPV6_GROUPS - head.length - tail.length;
  if (halves.length === 1 ? missing !== 0 : missing < 1) return null;
  const groups = [...head, ...Array<string>(halves.length === 1 ? 0 : missing).fill('0'), ...tail];
  return groups.every((g) => HEXTET.test(g)) ? groups : null;
}

/**
 * The key under which a client address is rate-limited: an IPv4 address (including one mapped
 * into IPv6) as itself, and an IPv6 address by its /64 prefix, since one host usually holds a
 * whole /64. Anything unrecognised is used as given.
 */
export function rateLimitKey(ip: string): string {
  const address = ip
    .trim()
    .replace(/^\[(.*)\]$/, '$1')
    .replace(/%.*$/, '')
    .toLowerCase();
  const mapped = MAPPED_IPV4.exec(address);
  if (mapped !== null) return mapped[1]!;
  if (!address.includes(':')) return address;
  const groups = hextets(address);
  if (groups === null) return address;
  return `${groups
    .slice(0, PREFIX_GROUPS)
    .map((g) => g.replace(/^0+(?=.)/, ''))
    .join(':')}::/64`;
}
