/** Copies `text` to the clipboard; false when the browser refuses or has no clipboard. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** Whether the browser offers its own share sheet. */
export const canShare = (): boolean =>
  typeof navigator !== 'undefined' && typeof navigator.share === 'function';
