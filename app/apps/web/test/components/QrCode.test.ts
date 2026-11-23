import { render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import { encode } from 'uqr';
import QrCode from '../../src/components/QrCode.svelte';

const LINK = 'https://example.test/#/join/K7Q2MX';

const darkModules = (link: string): number =>
  encode(link, { border: 0 }).data.flat().filter(Boolean).length;

describe('QrCode', () => {
  it('qr encodes the invite link', () => {
    const { container } = render(QrCode, { props: { link: LINK } });
    const image = screen.getByRole('img', { name: LINK });
    expect(image.tagName.toLowerCase()).toBe('svg');
    const path = container.querySelector('path')!.getAttribute('d')!;
    expect(path.match(/h1v1h-1z/g)).toHaveLength(darkModules(LINK));
  });

  it('draws a different code for a different link', () => {
    const first = render(QrCode, { props: { link: LINK } });
    const a = first.container.querySelector('path')!.getAttribute('d');
    first.unmount();
    const second = render(QrCode, { props: { link: `${LINK}?server=x` } });
    expect(second.container.querySelector('path')!.getAttribute('d')).not.toBe(a);
  });
});
