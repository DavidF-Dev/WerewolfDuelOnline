/** The Svelte store contract: `run` is called at once and on every change. */
export interface Readable<T> {
  subscribe(run: (value: T) => void): () => void;
}

export interface Writable<T> extends Readable<T> {
  get(): T;
  set(value: T): void;
}

export function writable<T>(initial: T): Writable<T> {
  let value = initial;
  const subscribers = new Set<(value: T) => void>();
  return {
    get: () => value,
    set(next) {
      value = next;
      for (const run of [...subscribers]) run(value);
    },
    subscribe(run) {
      subscribers.add(run);
      run(value);
      return () => {
        subscribers.delete(run);
      };
    },
  };
}
