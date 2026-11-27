import type { Attachment } from 'svelte/attachments';

/** The number of distinct rows the shown items of `items` sit on. */
function rows(items: readonly HTMLElement[]): number {
  const tops = new Set<number>();
  for (const item of items) if (!item.hidden) tops.add(Math.round(item.offsetTop));
  return tops.size;
}

/** The most rows a list of chips takes. */
const MAX_ROWS = 2;

/**
 * Keeps a wrapping list of chips to at most two rows. The list's last child is the "+n" item:
 * while every chip fits, it is hidden; otherwise the chips that do not fit are hidden from the
 * end and it shows how many, as `more` words it. The list is fitted again when it resizes or
 * fonts finish loading, never per frame. `shown` is what the list draws, given so that new
 * contents make a new attachment, which fits them.
 */
export function chipRows(
  more: (hidden: number) => string,
  shown: unknown,
): Attachment<HTMLElement> {
  void shown;
  return (list) => {
    const fit = (): void => {
      const items = Array.from(list.children) as HTMLElement[];
      const extra = items.pop();
      if (extra === undefined) return;
      for (const item of items) item.hidden = false;
      extra.hidden = true;
      if (rows(items) <= MAX_ROWS) return;
      extra.hidden = false;
      for (let kept = items.length - 1; kept >= 0; kept--) {
        items[kept]!.hidden = true;
        extra.textContent = more(items.length - kept);
        if (rows([...items.slice(0, kept), extra]) <= MAX_ROWS) return;
      }
    };
    fit();
    const resizes = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(fit);
    resizes?.observe(list);
    document.fonts?.addEventListener('loadingdone', fit);
    return () => {
      resizes?.disconnect();
      document.fonts?.removeEventListener('loadingdone', fit);
    };
  };
}
