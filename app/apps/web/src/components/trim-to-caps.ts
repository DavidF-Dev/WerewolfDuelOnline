/** A zero-width inline block one cap height tall, standing on the line's baseline. */
function capProbe(): HTMLElement {
  const probe = document.createElement('span');
  probe.setAttribute('aria-hidden', 'true');
  probe.style.cssText = 'display:inline-block;width:0;height:1cap;vertical-align:baseline';
  return probe;
}

/**
 * Where CSS text-box trimming is unavailable, gives `element` negative block margins so its
 * margin box runs from the top of its first line's capitals to its last line's baseline, as
 * `text-box: trim-both cap alphabetic` would. The trims are measured from the laid-out lines,
 * so they follow the font, its size and the browser's rounding of its metrics.
 */
export function trimToCaps(element: HTMLElement): { destroy: () => void } {
  // Without ResizeObserver the title keeps its full line box.
  if (typeof ResizeObserver === 'undefined') return { destroy: () => undefined };
  const update = (): void => {
    if (getComputedStyle(element).getPropertyValue('text-box-trim') === 'trim-both') {
      element.style.marginBlock = '';
      return;
    }
    const first = capProbe();
    const last = capProbe();
    element.prepend(first);
    element.append(last);
    const box = element.getBoundingClientRect();
    const top = first.getBoundingClientRect().top - box.top;
    const bottom = box.bottom - last.getBoundingClientRect().bottom;
    first.remove();
    last.remove();
    element.style.marginBlock = `${-top}px ${-bottom}px`;
  };
  // The trims change with the box: its font, size, text and wrapping all resize it.
  const observer = new ResizeObserver(update);
  observer.observe(element);
  document.fonts?.addEventListener('loadingdone', update);
  return {
    destroy: () => {
      observer.disconnect();
      document.fonts?.removeEventListener('loadingdone', update);
    },
  };
}
