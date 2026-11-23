/** Notifies `onOpen` listeners once a transport opens, and at once any listener added after that. */
export class OpenSignal {
  private opened = false;
  private readonly listeners = new Set<() => void>();

  subscribe(cb: () => void): () => void {
    if (this.opened) {
      cb();
      return () => {};
    }
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  fire(): void {
    if (this.opened) return;
    this.opened = true;
    const listeners = [...this.listeners];
    this.listeners.clear();
    for (const cb of listeners) cb();
  }

  /** Drops every waiting listener; called when the transport closes before opening. */
  cancel(): void {
    this.listeners.clear();
  }
}
