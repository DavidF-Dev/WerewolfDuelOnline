/** How far each step shrinks a label, as a share of its normal font size. */
const STEP = 0.025;
/** The most steps a label shrinks by: down to 80 % of its normal font size. */
const MAX_STEPS = 8;
/** Overflow smaller than this, in CSS pixels, is rounding rather than text that does not fit. */
const EPSILON = 0.01;

interface Fit {
  element: HTMLElement;
  /** The text the label was last fitted to. */
  text: string;
  /** The label's client box when it was last fitted, to tell its own resizes from a new box. */
  width: number;
  height: number;
  /** Whether the label had a `title` of its own, which is then never changed. */
  ownTitle: boolean;
  /** The normal font size, in pixels, while a fit is under way. */
  base: number;
  /** How many steps the label is shrunk by while a fit is under way. */
  steps: number;
  /** The width of the text and of the room for it, in CSS pixels, from the last measurement. */
  need: number;
  room: number;
  /** How many font faces had loaded when the label was last fitted. */
  faces: number;
  texts: MutationObserver;
}

const fits = new Map<Element, Fit>();
const dirty = new Set<Fit>();
let scheduled = false;
let resizes: ResizeObserver | null = null;
let root: MutationObserver | null = null;
let range: Range | null = null;
/** How a label clips sideways: `clip` keeps descenders below a tight line box where supported. */
let clipX = 'hidden';
/** The root's text size, font size, reading font and spacing when the labels were last fitted. */
let textScale = '';
let rootSize = '';
let readingFont: string | undefined;
let spacing: string | undefined;

/**
 * Measures the label's text and the room for it in CSS pixels, to a fraction of a pixel: the
 * text by a range around it, the room as its content box. A label without a laid-out width
 * falls back to its whole-pixel scroll and client widths.
 */
function measure(fit: Fit): void {
  const { element } = fit;
  const box = element.getBoundingClientRect();
  const style = getComputedStyle(element);
  const sides =
    parseFloat(style.paddingLeft) +
    parseFloat(style.paddingRight) +
    parseFloat(style.borderLeftWidth) +
    parseFloat(style.borderRightWidth);
  const width = parseFloat(style.width);
  const outer = style.boxSizing === 'border-box' ? width : width + sides;
  if (!(box.width > 0) || !(outer > 0)) {
    fit.need = element.scrollWidth;
    fit.room = element.clientWidth;
    return;
  }
  range ??= document.createRange();
  range.selectNodeContents(element);
  // The range is measured on screen, where zoom and scaling apply; the box's own width undoes them.
  fit.need = (range.getBoundingClientRect().width * outer) / box.width;
  fit.room = outer - sides;
}

const overflows = (fit: Fit): boolean => fit.need > fit.room + EPSILON;

/** How many of the document's font faces have loaded. */
function loadedFaces(): number {
  let loaded = 0;
  document.fonts?.forEach((face) => {
    if (face.status === 'loaded') loaded += 1;
  });
  return loaded;
}

/** Records the label's final box and whether it is cut, which shows its full text as a tooltip. */
function finish(fit: Fit, cut: boolean): void {
  const { element } = fit;
  fit.width = element.clientWidth;
  fit.height = element.clientHeight;
  if (fit.ownTitle) return;
  if (cut) element.title = fit.text;
  else element.removeAttribute('title');
}

/**
 * Fits every label waiting for it. Each pass writes the trial sizes of all of them, then reads
 * them all back, so a pass lays the page out once however many labels it fits.
 */
function run(): void {
  scheduled = false;
  const pending = Array.from(dirty);
  dirty.clear();
  const faces = loadedFaces();
  for (const fit of pending) {
    fit.faces = faces;
    fit.element.style.fontSize = '';
  }
  let trying: Fit[] = [];
  for (const fit of pending) {
    const { element } = fit;
    fit.text = element.textContent ?? '';
    fit.base = parseFloat(getComputedStyle(element).fontSize);
    measure(fit);
    if (!overflows(fit) || !(fit.base > 0)) {
      fit.steps = 0;
      finish(fit, false);
      continue;
    }
    // A line's width scales with its font size, so the first trial is the estimated fit.
    const scale = fit.room / fit.need;
    fit.steps = Math.min(MAX_STEPS, Math.max(1, Math.ceil((1 - scale) / STEP - 1e-9)));
    trying.push(fit);
  }
  while (trying.length > 0) {
    for (const fit of trying) {
      fit.element.style.fontSize = `${fit.base * (1 - fit.steps * STEP)}px`;
    }
    const next: Fit[] = [];
    for (const fit of trying) {
      measure(fit);
      if (!overflows(fit)) finish(fit, false);
      else if (fit.steps === MAX_STEPS) finish(fit, true);
      else next.push(fit);
    }
    for (const fit of next) fit.steps++;
    trying = next;
  }
}

function schedule(fit: Fit): void {
  dirty.add(fit);
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(run);
}

function scheduleAll(): void {
  for (const fit of fits.values()) schedule(fit);
}

/** Fits again the labels fitted before the latest fonts loaded; a load they already used changes nothing. */
function onFontsLoaded(): void {
  const faces = loadedFaces();
  for (const fit of fits.values()) if (fit.faces !== faces) schedule(fit);
}

function onResize(entries: ResizeObserverEntry[]): void {
  for (const entry of entries) {
    const fit = fits.get(entry.target);
    if (fit === undefined) continue;
    const { element } = fit;
    if (element.clientWidth !== fit.width || element.clientHeight !== fit.height) schedule(fit);
  }
}

/** Fits every label again when the root's text size, font size, reading font or spacing has changed. */
function onRootChange(): void {
  const html = document.documentElement;
  const scale = html.style.getPropertyValue('--text-scale');
  const size = html.style.fontSize;
  const font = html.dataset['font'];
  const space = html.dataset['spacing'];
  if (scale === textScale && size === rootSize && font === readingFont && space === spacing) {
    return;
  }
  textScale = scale;
  rootSize = size;
  readingFont = font;
  spacing = space;
  scheduleAll();
}

function start(): void {
  if (typeof ResizeObserver !== 'undefined') resizes = new ResizeObserver(onResize);
  clipX = typeof CSS !== 'undefined' && CSS.supports?.('overflow-x', 'clip') ? 'clip' : 'hidden';
  const html = document.documentElement;
  textScale = html.style.getPropertyValue('--text-scale');
  rootSize = html.style.fontSize;
  readingFont = html.dataset['font'];
  spacing = html.dataset['spacing'];
  // The text-size, reading-font and spacing settings live on the root element, beside unrelated styles.
  root = new MutationObserver(onRootChange);
  root.observe(html, { attributes: true, attributeFilter: ['style', 'data-font', 'data-spacing'] });
  document.fonts?.addEventListener('loadingdone', onFontsLoaded);
}

function stop(): void {
  resizes?.disconnect();
  resizes = null;
  root?.disconnect();
  root = null;
  range = null;
  document.fonts?.removeEventListener('loadingdone', onFontsLoaded);
}

/**
 * Keeps a one-line label inside its box: while its text is wider than the box, its font size
 * shrinks in steps of 2.5 % of its normal size, down to 80 % of it; a label still too wide
 * there ends in an ellipsis and shows its full text as its `title`, unless it has a title of
 * its own. The text stays whole in the document, so its accessible name is unchanged. The
 * label is fitted again when its box resizes, its text changes, the text size, reading font or
 * spacing changes, fonts finish loading, or the action's parameter changes (for a change of style the
 * label cannot see, such as turning bold); fits are batched into the next animation frame.
 */
export function fitText(
  element: HTMLElement,
  _look?: unknown,
): { update: () => void; destroy: () => void } {
  if (fits.size === 0) start();
  element.style.overflowX = clipX;
  element.style.whiteSpace = 'nowrap';
  element.style.textOverflow = 'ellipsis';
  // Lets a flex or grid item narrow below its text.
  element.style.minWidth = '0';
  const fit: Fit = {
    element,
    text: '',
    width: -1,
    height: -1,
    ownTitle: element.hasAttribute('title'),
    base: 0,
    steps: 0,
    need: 0,
    room: 0,
    faces: -1,
    texts: new MutationObserver(() => {
      if (element.textContent !== fit.text) schedule(fit);
    }),
  };
  fit.texts.observe(element, { characterData: true, childList: true, subtree: true });
  fits.set(element, fit);
  resizes?.observe(element);
  schedule(fit);
  return {
    update: () => schedule(fit),
    destroy: () => {
      fit.texts.disconnect();
      resizes?.unobserve(element);
      fits.delete(element);
      dirty.delete(fit);
      if (fits.size === 0) stop();
    },
  };
}
