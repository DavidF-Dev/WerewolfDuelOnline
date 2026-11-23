/** Gives a short vibration where the device supports it. */
export function buzz(): void {
  if (typeof navigator.vibrate === 'function') navigator.vibrate(30);
}
