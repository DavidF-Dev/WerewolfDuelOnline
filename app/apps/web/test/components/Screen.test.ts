import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { createRawSnippet } from 'svelte';
import { describe, expect, it, vi } from 'vitest';
import Button from '../../src/components/Button.svelte';
import Screen from '../../src/components/Screen.svelte';

const text = (html: string) => createRawSnippet(() => ({ render: () => html }));

describe('Screen', () => {
  it('labels its main region with the app bar heading', () => {
    render(Screen, {
      props: { title: 'Host a game', testId: 'host', children: text('<p>Body</p>') },
    });
    const main = screen.getByRole('main', { name: 'Host a game' });
    expect(main.getAttribute('data-testid')).toBe('host');
    expect(main.textContent).toContain('Body');
    expect(screen.getByRole('heading', { level: 1, name: 'Host a game' })).toBeTruthy();
    expect(screen.getByRole('banner').querySelector('svg')?.getAttribute('aria-hidden')).toBe(
      'true',
    );
  });
});

describe('Button', () => {
  it('is a plain button carrying its variant and extra attributes', async () => {
    const onclick = vi.fn();
    render(Button, {
      props: {
        variant: 'primary',
        onclick,
        'data-testid': 'go',
        children: text('<span>Go</span>'),
      },
    });
    const button = screen.getByRole('button', { name: 'Go' });
    expect(button.getAttribute('type')).toBe('button');
    expect(button.getAttribute('data-testid')).toBe('go');
    expect(button.classList.contains('primary')).toBe(true);
    await userEvent.setup().click(button);
    expect(onclick).toHaveBeenCalledOnce();
  });
});
