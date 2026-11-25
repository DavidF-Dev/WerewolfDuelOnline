import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { fitText } from '../../src/components/fit-text.js';

/** Each observed element, so a test can report that its box has resized. */
const observed = new Set<Element>();
let notify: ResizeObserverCallback = () => undefined;

class FakeResizeObserver {
  constructor(callback: ResizeObserverCallback) {
    notify = callback;
  }
  observe(element: Element): void {
    observed.add(element);
  }
  unobserve(element: Element): void {
    observed.delete(element);
  }
  disconnect(): void {
    observed.clear();
  }
}

/** The width, in pixels, of each character at a 1 px font size. */
const ADVANCE = 0.6;

/** A label whose text lays out `ADVANCE` em per character in a box `room` pixels wide. */
function label(text: string, room: number): { element: HTMLElement; resize: (to: number) => void } {
  const element = document.createElement('span');
  element.className = 'label';
  element.textContent = text;
  let width = room;
  const size = (): number => parseFloat(getComputedStyle(element).fontSize);
  Object.defineProperties(element, {
    clientWidth: { get: () => width },
    clientHeight: { get: () => Math.round(size() * 1.2) },
    scrollWidth: {
      get: () => Math.max(width, Math.ceil((element.textContent ?? '').length * ADVANCE * size())),
    },
  });
  document.body.append(element);
  return {
    element,
    resize: (to) => {
      width = to;
      notify(
        [{ target: element } as unknown as ResizeObserverEntry],
        {} as unknown as ResizeObserver,
      );
    },
  };
}

const frame = (): Promise<void> => new Promise((done) => requestAnimationFrame(() => done()));
const fontSize = (element: HTMLElement): number => parseFloat(getComputedStyle(element).fontSize);
const fits = (element: HTMLElement): boolean => element.scrollWidth <= element.clientWidth;

const style = document.createElement('style');

beforeAll(() => {
  (globalThis as { ResizeObserver: unknown }).ResizeObserver = FakeResizeObserver;
  style.textContent = '.label { font-size: 10px; }';
  document.head.append(style);
});

const mounted: Array<{ destroy: () => void }> = [];
const fit = (element: HTMLElement): void => {
  mounted.push(fitText(element));
};

afterEach(() => {
  for (const action of mounted.splice(0)) action.destroy();
  document.body.replaceChildren();
});

describe('fitText', () => {
  it('keeps a label that fits at its normal size', async () => {
    const { element } = label('Seer', 100);
    fit(element);
    await frame();
    expect(element.style.fontSize).toBe('');
    expect(fontSize(element)).toBe(10);
    expect(element.hasAttribute('title')).toBe(false);
  });

  it('shrinks a label that is too wide until it fits, no further', async () => {
    // 11 characters are 66 px wide at 10 px; in 55 px they fit at 8.25 px, the largest step that does.
    const { element } = label('Wolf Beauty', 55);
    fit(element);
    await frame();
    expect(fits(element)).toBe(true);
    expect(fontSize(element)).toBeCloseTo(8.25, 5);
    expect(element.style.whiteSpace).toBe('nowrap');
    expect(element.hasAttribute('title')).toBe(false);
  });

  it('stops at 80 % of the normal size, then ends in an ellipsis with the full text as its title', async () => {
    const { element } = label('Maximiliane-Alexandra', 60);
    fit(element);
    await frame();
    expect(fontSize(element)).toBeCloseTo(8, 5);
    expect(fits(element)).toBe(false);
    expect(['clip', 'hidden']).toContain(element.style.overflowX);
    expect(element.style.textOverflow).toBe('ellipsis');
    expect(element.title).toBe('Maximiliane-Alexandra');
    expect(element.textContent).toBe('Maximiliane-Alexandra');
  });

  it('grows back to its normal size when its box has room again', async () => {
    const { element, resize } = label('Maximiliane-Alexandra', 60);
    fit(element);
    await frame();
    resize(200);
    await frame();
    expect(element.style.fontSize).toBe('');
    expect(fontSize(element)).toBe(10);
    expect(element.hasAttribute('title')).toBe(false);
  });

  it('fits again when its text changes', async () => {
    const { element } = label('Seer', 55);
    fit(element);
    await frame();
    expect(fontSize(element)).toBe(10);
    element.textContent = 'Wolf Beauty';
    await Promise.resolve();
    await frame();
    expect(fits(element)).toBe(true);
    expect(fontSize(element)).toBeLessThan(10);
  });

  it('fits again when the text size changes on the root element', async () => {
    const { element, resize } = label('Wolf Beauty', 100);
    fit(element);
    await frame();
    resize(55);
    await frame();
    // A resize report with an unchanged box is its own font change, so the fit stands.
    expect(fontSize(element)).toBeCloseTo(8.25, 5);
    // The larger text cannot fit even at 80 %, so it is cut.
    style.textContent = '.label { font-size: 12px; }';
    document.documentElement.style.setProperty('--text-scale', '1.2');
    await Promise.resolve();
    await frame();
    expect(fontSize(element)).toBeCloseTo(9.6, 5);
    expect(element.title).toBe('Wolf Beauty');
    style.textContent = '.label { font-size: 10px; }';
    document.documentElement.style.removeProperty('--text-scale');
  });

  it('leaves a title of its own alone', async () => {
    const { element } = label('Maximiliane-Alexandra', 60);
    element.title = 'Maximiliane-Alexandra-Ro';
    fit(element);
    await frame();
    expect(element.title).toBe('Maximiliane-Alexandra-Ro');
  });

  it('stops observing once destroyed', async () => {
    const { element } = label('Seer', 100);
    const action = fitText(element);
    action.destroy();
    expect(observed.has(element)).toBe(false);
    element.textContent = 'Maximiliane-Alexandra';
    await Promise.resolve();
    await frame();
    expect(element.style.fontSize).toBe('');
  });
  it('fits again when its parameter changes, with the same box and text', async () => {
    const { element } = label('Wolf Beauty', 55);
    const action = fitText(element, false);
    mounted.push(action);
    await frame();
    expect(fontSize(element)).toBeCloseTo(8.25, 5);
    // As when a label turns bold: wider text the label cannot see.
    style.textContent = '.label { font-size: 12px; }';
    action.update();
    await frame();
    expect(fontSize(element)).toBeCloseTo(9.6, 5);
    style.textContent = '.label { font-size: 10px; }';
  });

  it('does not fit again for root style changes other than the text size', async () => {
    const { element } = label('Wolf Beauty', 55);
    fit(element);
    await frame();
    style.textContent = '.label { font-size: 12px; }';
    document.documentElement.style.scrollPaddingTop = '52px';
    document.documentElement.style.scrollPaddingBottom = '120px';
    await Promise.resolve();
    await frame();
    expect(element.style.fontSize).toBe('8.25px');
    style.textContent = '.label { font-size: 10px; }';
    document.documentElement.style.removeProperty('scroll-padding-top');
    document.documentElement.style.removeProperty('scroll-padding-bottom');
  });

  it('shrinks a label whose text is wider than its box by less than a pixel', async () => {
    // Whole-pixel widths call this label a fit; its text is 0.4 px wider than its 50 px box.
    const { element } = label('Seer', 50);
    element.style.width = '50px';
    element.style.padding = '0';
    element.style.border = '0';
    const text = (): number => 50.4 * (fontSize(element) / 10);
    Object.defineProperties(element, {
      getBoundingClientRect: { value: () => ({ width: 50 }) as DOMRect },
    });
    const measure = Range.prototype.getBoundingClientRect;
    Range.prototype.getBoundingClientRect = function (this: Range) {
      return { width: this.startContainer === element ? text() : 0 } as DOMRect;
    };
    try {
      fit(element);
      await frame();
      expect(fontSize(element)).toBeCloseTo(9.75, 5);
      expect(element.hasAttribute('title')).toBe(false);
    } finally {
      Range.prototype.getBoundingClientRect = measure;
    }
  });

  it('fits again when extra spacing is turned on or off', async () => {
    const { element } = label('Wolf Beauty', 55);
    fit(element);
    await frame();
    expect(fontSize(element)).toBeCloseTo(8.25, 5);
    style.textContent = '.label { font-size: 12px; }';
    document.documentElement.setAttribute('data-spacing', 'extra');
    await Promise.resolve();
    await frame();
    expect(fontSize(element)).toBeCloseTo(9.6, 5);
    style.textContent = '.label { font-size: 10px; }';
    document.documentElement.removeAttribute('data-spacing');
    await Promise.resolve();
    await frame();
    expect(fontSize(element)).toBeCloseTo(8.25, 5);
  });

  it('fits again when a font finishes loading, but not for a load it has already fitted with', async () => {
    const faces = [{ status: 'loaded' }, { status: 'loading' }];
    const fonts = Object.assign(new EventTarget(), {
      forEach: (each: (face: { status: string }) => void) => faces.forEach(each),
    });
    Object.defineProperty(document, 'fonts', { value: fonts, configurable: true });
    try {
      const { element } = label('Wolf Beauty', 55);
      fit(element);
      await frame();
      expect(fontSize(element)).toBeCloseTo(8.25, 5);
      // A load reported after the fit that already used it changes nothing.
      style.textContent = '.label { font-size: 12px; }';
      fonts.dispatchEvent(new Event('loadingdone'));
      await frame();
      expect(fontSize(element)).toBeCloseTo(8.25, 5);
      // A face that has loaded since the fit can change the text's width.
      faces[1]!.status = 'loaded';
      fonts.dispatchEvent(new Event('loadingdone'));
      await frame();
      expect(fontSize(element)).toBeCloseTo(9.6, 5);
    } finally {
      style.textContent = '.label { font-size: 10px; }';
      Reflect.deleteProperty(document, 'fonts');
    }
  });
});
