import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import ConfirmDialog from '../src/components/ConfirmDialog.svelte';

function renderDialog() {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  const result = render(ConfirmDialog, {
    props: { title: 'Sure?', confirmLabel: 'Yes', cancelLabel: 'No', onConfirm, onCancel },
  });
  const dialog = screen.getByRole('alertdialog', { name: 'Sure?' }) as HTMLDialogElement;
  return { ...result, dialog, onConfirm, onCancel };
}

describe('ConfirmDialog', () => {
  it('takes a close without an answer as cancelling', () => {
    const { dialog, onConfirm, onCancel } = renderDialog();
    expect(dialog.open).toBe(true);
    dialog.close();
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('answers once when an answer is followed by closing', async () => {
    const { dialog, onConfirm, onCancel, unmount } = renderDialog();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Yes' }));
    unmount();
    expect(dialog.open).toBe(false);
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });
});
