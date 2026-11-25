/**
 * Shows a newly opened screen from its top: scrolls the window up and moves focus to the screen's
 * heading, so keyboard and screen reader users start there. A screen that has already moved focus
 * itself, such as to the action it asks for, keeps it.
 */
export function showScreenTop(): void {
  window.scrollTo(0, 0);
  const active = document.activeElement;
  if (active !== null && active !== document.body && active.isConnected) return;
  const heading = document.querySelector<HTMLElement>('h1');
  if (heading === null) return;
  if (!heading.hasAttribute('tabindex')) heading.tabIndex = -1;
  heading.focus({ preventScroll: true });
}
