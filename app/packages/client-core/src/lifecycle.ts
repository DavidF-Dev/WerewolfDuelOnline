/** The page lifecycle signals a connection depends on. Each `on…` returns a function that removes the listener. */
export interface Lifecycle {
  isVisible(): boolean;
  onVisibilityChange(cb: (visible: boolean) => void): () => void;
  /** Called on every `pageshow`; `persisted` is true when the page was restored from the back/forward cache. */
  onPageShow(cb: (persisted: boolean) => void): () => void;
  onOnline(cb: () => void): () => void;
}

interface EventTargetLike {
  addEventListener(type: string, listener: (event: never) => void): void;
  removeEventListener(type: string, listener: (event: never) => void): void;
}

/** The members of `document` and `window` that `browserLifecycle` reads. */
interface BrowserGlobals {
  document: EventTargetLike & { readonly visibilityState: string };
  window: EventTargetLike;
}

function listen<E>(
  target: EventTargetLike,
  type: string,
  listener: (event: E) => void,
): () => void {
  target.addEventListener(type, listener);
  return () => target.removeEventListener(type, listener);
}

/** A `Lifecycle` backed by `document` and `window`; they are read only when this is called. */
export function browserLifecycle(): Lifecycle {
  const { document, window } = globalThis as unknown as BrowserGlobals;
  const isVisible = (): boolean => document.visibilityState === 'visible';
  return {
    isVisible,
    onVisibilityChange: (cb) => listen(document, 'visibilitychange', () => cb(isVisible())),
    onPageShow: (cb) =>
      listen<{ persisted: boolean }>(window, 'pageshow', (event) => cb(event.persisted)),
    onOnline: (cb) => listen(window, 'online', () => cb()),
  };
}
