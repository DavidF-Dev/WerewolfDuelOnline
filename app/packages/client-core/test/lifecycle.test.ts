import { afterEach, describe, expect, it } from 'vitest';
import { browserLifecycle } from '../src/index.js';

const host = globalThis as unknown as { document?: unknown; window?: unknown };

afterEach(() => {
  delete host.document;
  delete host.window;
});

function stubBrowser(): {
  document: EventTarget & { visibilityState: string };
  window: EventTarget;
} {
  const document = Object.assign(new EventTarget(), { visibilityState: 'visible' });
  const window = new EventTarget();
  host.document = document;
  host.window = window;
  return { document, window };
}

describe('browserLifecycle', () => {
  it('reports visibility, pageshow and online, and removes its listeners', () => {
    const { document, window } = stubBrowser();
    const lifecycle = browserLifecycle();
    const seen: string[] = [];
    const offs = [
      lifecycle.onVisibilityChange((visible) => seen.push(`visible:${visible}`)),
      lifecycle.onPageShow((persisted) => seen.push(`pageshow:${persisted}`)),
      lifecycle.onOnline(() => seen.push('online')),
    ];
    expect(lifecycle.isVisible()).toBe(true);
    document.visibilityState = 'hidden';
    document.dispatchEvent(new Event('visibilitychange'));
    expect(lifecycle.isVisible()).toBe(false);
    window.dispatchEvent(Object.assign(new Event('pageshow'), { persisted: true }));
    window.dispatchEvent(new Event('online'));
    expect(seen).toEqual(['visible:false', 'pageshow:true', 'online']);

    for (const off of offs) off();
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('online'));
    expect(seen).toHaveLength(3);
  });
});
