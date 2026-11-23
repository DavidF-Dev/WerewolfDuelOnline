import type { Lifecycle } from '../src/index.js';
import { flush } from './helpers.js';

/** Deterministic timers: nothing fires until the test moves the clock. */
export class FakeTimers {
  time = 1_000_000;
  private nextId = 1;
  private readonly pending = new Map<number, { at: number; fn: () => void }>();

  readonly now = (): number => this.time;

  readonly setTimeout = (fn: () => void, ms: number): unknown => {
    const id = this.nextId++;
    this.pending.set(id, { at: this.time + ms, fn });
    return id;
  };

  readonly clearTimeout = (handle: unknown): void => {
    this.pending.delete(handle as number);
  };

  get count(): number {
    return this.pending.size;
  }

  /** Moves the clock forward, firing each timer at its due time. */
  async advance(ms: number): Promise<void> {
    const end = this.time + ms;
    for (;;) {
      const due = this.earliest(end);
      if (due === undefined) break;
      this.time = due[1].at;
      this.pending.delete(due[0]);
      due[1].fn();
      await flush();
    }
    this.time = end;
    await flush();
  }

  /** Moves the clock forward with nothing firing, as on a suspended device, then fires what is overdue. */
  async sleep(ms: number): Promise<void> {
    this.time += ms;
    for (;;) {
      const due = this.earliest(this.time);
      if (due === undefined) break;
      this.pending.delete(due[0]);
      due[1].fn();
      await flush();
    }
    await flush();
  }

  private earliest(limit: number): [number, { at: number; fn: () => void }] | undefined {
    let best: [number, { at: number; fn: () => void }] | undefined;
    for (const entry of this.pending) {
      if (entry[1].at > limit) continue;
      if (best === undefined || entry[1].at < best[1].at) best = entry;
    }
    return best;
  }
}

export class FakeLifecycle implements Lifecycle {
  private readonly visibility = new Set<(visible: boolean) => void>();
  private readonly pageShows = new Set<(persisted: boolean) => void>();
  private readonly onlines = new Set<() => void>();

  constructor(public visible = true) {}

  isVisible(): boolean {
    return this.visible;
  }

  onVisibilityChange(cb: (visible: boolean) => void): () => void {
    this.visibility.add(cb);
    return () => this.visibility.delete(cb);
  }

  onPageShow(cb: (persisted: boolean) => void): () => void {
    this.pageShows.add(cb);
    return () => this.pageShows.delete(cb);
  }

  onOnline(cb: () => void): () => void {
    this.onlines.add(cb);
    return () => this.onlines.delete(cb);
  }

  setVisible(visible: boolean): void {
    this.visible = visible;
    for (const cb of [...this.visibility]) cb(visible);
  }

  pageShow(persisted: boolean): void {
    for (const cb of [...this.pageShows]) cb(persisted);
  }

  goOnline(): void {
    for (const cb of [...this.onlines]) cb();
  }

  get listeners(): number {
    return this.visibility.size + this.pageShows.size + this.onlines.size;
  }
}
