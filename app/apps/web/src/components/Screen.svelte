<script lang="ts">
  import { untrack, type Snippet } from 'svelte';
  import { appBanner } from '../banner.js';
  import Scenery from '../kit/Scenery.svelte';
  import { goBack } from '../router.js';
  import { frame } from '../frame.svelte.js';
  import AppBar from './AppBar.svelte';

  interface Props {
    title: string;
    /** Draws the title as the app's name, in the display face. */
    brand?: boolean;
    testId: string;
    /** The accessible name of the back button; without it there is none. */
    back?: string;
    /** What sits before the title when there is no back button. */
    left?: Snippet;
    /** What sits after the title. */
    right?: Snippet;
    /** Notices shown right under the bar, outside the body, such as the connection banner. */
    banner?: Snippet;
    /** Less space between and inside panels, for the dense game screens. */
    tight?: boolean;
    /** A page footer after the main region, over the same scenery, such as Home's notice. */
    pageFooter?: Snippet;
    /** What stays below the body, such as the phase bar. */
    footer?: Snippet;
    /** A line at the very foot of a fit screen, below the footer, such as the unofficial notice. */
    note?: Snippet;
    /**
     * A game screen: the body fills exactly the space between the bar and the footer, and only the
     * body scrolls when its content is taller, so the bar and the footer stay on screen.
     */
    fit?: boolean;
    children: Snippet;
  }

  let {
    title,
    brand = false,
    testId,
    back,
    left,
    right,
    banner,
    tight = false,
    pageFooter,
    footer,
    note,
    fit = false,
    children,
  }: Props = $props();
  const uid = $props.id();
  const shared = appBanner();

  let topPart = $state<HTMLElement>();
  let footerPart = $state<HTMLElement>();
  // The page scrolls focused elements clear of the bars that stay on screen over it.
  $effect(() => {
    const parts = [topPart, footerPart];
    if (typeof ResizeObserver === 'undefined') return;
    const style = document.documentElement.style;
    let padding: [string, string] = ['', ''];
    const measure = (): void => {
      padding = [`${topPart?.offsetHeight ?? 0}px`, `${footerPart?.offsetHeight ?? 0}px`];
      [style.scrollPaddingTop, style.scrollPaddingBottom] = padding;
    };
    const watch = new ResizeObserver(measure);
    for (const part of parts) if (part) watch.observe(part);
    measure();
    return () => {
      watch.disconnect();
      // Another screen may have set its own already.
      if (style.scrollPaddingTop === padding[0]) style.scrollPaddingTop = '';
      if (style.scrollPaddingBottom === padding[1]) style.scrollPaddingBottom = '';
    };
  });

  let body = $state<HTMLElement>();
  let bodyScrolls = $state(false);
  // A fit body that scrolls takes keyboard focus, so it can be scrolled without a pointer.
  $effect(() => {
    const main = body;
    if (!fit || main === undefined || typeof ResizeObserver === 'undefined') return;
    const check = (): void => {
      bodyScrolls = main.scrollHeight > main.clientHeight + 1;
    };
    const watch = new ResizeObserver(check);
    // The body keeps its size as its content grows, so its parts are watched too, as they change.
    const observeParts = (): void => {
      watch.disconnect();
      for (const part of [main, ...Array.from(main.children)]) watch.observe(part);
      check();
    };
    const swaps = new MutationObserver(observeParts);
    swaps.observe(main, { childList: true });
    observeParts();
    return () => {
      swaps.disconnect();
      watch.disconnect();
    };
  });

  $effect(() => {
    if (!fit) return;
    untrack(() => (frame.fitScreens += 1));
    return () => untrack(() => (frame.fitScreens -= 1));
  });
</script>

<div class="screen" data-part="screen" data-fit={fit || undefined}>
  <div class="top" data-part="top" bind:this={topPart}>
    <AppBar {title} {brand} headingId="{uid}-heading" {back} onback={goBack} {left} {right} />
    {#if shared !== undefined || banner !== undefined}
      <div class="banners" data-part="banners">
        {@render shared?.()}
        {@render banner?.()}
      </div>
    {/if}
  </div>
  {#if pageFooter}
    <div class="stage">
      <Scenery />
      <main
        class={['body', 'bare', { tight }]}
        aria-labelledby="{uid}-heading"
        data-testid={testId}
      >
        {@render children()}
      </main>
      <div class="page-footer">{@render pageFooter()}</div>
    </div>
  {:else}
    <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
    <main
      class={['body', { tight }]}
      aria-labelledby="{uid}-heading"
      data-testid={testId}
      tabindex={bodyScrolls ? 0 : undefined}
      bind:this={body}
    >
      <Scenery />
      {@render children()}
    </main>
  {/if}
  {#if footer}
    <div class="footer" bind:this={footerPart}>{@render footer()}</div>
  {/if}
  {#if note}
    <div class="note" data-part="note">{@render note()}</div>
  {/if}
</div>

<style>
  .screen {
    display: flex;
    flex-direction: column;
    margin-inline: auto;
    max-width: 30rem;
    min-height: 100vh;
    min-height: 100dvh;
    width: 100%;
  }

  .screen[data-fit] {
    height: 100vh;
    height: 100dvh;
    min-height: 0;
  }

  /* The bar and the banners under it stay at the top while the page scrolls. */
  .top {
    flex: none;
    position: sticky;
    top: 0;
    z-index: 3;
  }

  .banners {
    display: flex;
    flex: none;
    flex-direction: column;
    position: relative;
  }

  .body {
    background: linear-gradient(
      to bottom,
      var(--surface-2) 55%,
      color-mix(in srgb, var(--sky-glow) 45%, var(--surface-2))
    );
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    gap: 10px;
    isolation: isolate;
    margin: 0;
    max-width: none;
    padding: 12px;
    position: relative;
  }

  .stage {
    background: linear-gradient(
      to bottom,
      var(--surface-2) 55%,
      color-mix(in srgb, var(--sky-glow) 45%, var(--surface-2))
    );
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    isolation: isolate;
    position: relative;
  }

  .bare {
    background: none;
  }

  .page-footer {
    padding: 0 12px 12px;
  }

  .tight {
    gap: 6px;
    padding: 10px;
  }

  [data-fit] .body {
    min-height: 0;
    overflow-y: auto;
  }

  .footer {
    background: var(--surface);
    border-top: 1px solid var(--line);
    bottom: 0;
    flex: none;
    padding: 6px 12px 8px;
    position: sticky;
    z-index: 2;
  }

  .note {
    flex: none;
    padding: 2px 12px 4px;
  }

  .note > :global(*) {
    margin: 0;
  }
</style>
