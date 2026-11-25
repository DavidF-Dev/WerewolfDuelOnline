import { render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import type { ClientStatus } from '@wwd/client-core';
import WaitingStatus, { waitStateOf } from '../../src/components/WaitingStatus.svelte';

describe('WaitingStatus', () => {
  it('waits only while connecting or waiting for the opponent', () => {
    const states: Record<ClientStatus, string> = {
      connecting: 'waiting',
      waiting: 'waiting',
      playing: 'done',
      game_over: 'ended',
      disconnected: 'ended',
      rejected: 'ended',
    };
    for (const [status, state] of Object.entries(states)) {
      expect(waitStateOf(status as ClientStatus), status).toBe(state);
    }
  });

  it('shows a spinner while waiting, a dot once done and nothing once ended', () => {
    const indicators = (state: 'waiting' | 'done' | 'ended') => {
      const { unmount } = render(WaitingStatus, { props: { text: 'Status', state, testId: 's' } });
      const panel = screen.getByTestId('s').closest('.panel')!;
      const shown = {
        spinner: panel.querySelector('[data-part="spinner"]') !== null,
        dot: panel.querySelector('.dot') !== null,
      };
      unmount();
      return shown;
    };
    expect(indicators('waiting')).toEqual({ spinner: true, dot: false });
    expect(indicators('done')).toEqual({ spinner: false, dot: true });
    expect(indicators('ended')).toEqual({ spinner: false, dot: false });
  });
});
