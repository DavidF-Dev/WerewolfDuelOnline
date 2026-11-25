<script lang="ts">
  interface Props {
    /** Sets the spinner a little apart from the text before it; leave it off where a gap does that. */
    spaced?: boolean;
  }

  let { spaced = true }: Props = $props();
</script>

<span class={['kit-spinner', { spaced }]} data-part="spinner" aria-hidden="true"></span>

<style>
  .kit-spinner {
    border: 0.15em solid color-mix(in srgb, currentColor 25%, transparent);
    border-block-start-color: currentColor;
    border-radius: 50%;
    box-sizing: border-box;
    display: inline-block;
    flex: none;
    height: 0.875em;
    vertical-align: -0.1em;
    width: 0.875em;
  }

  .spaced {
    margin-inline-start: 0.4em;
  }

  :global(:root:not([data-motion='reduce'])) .kit-spinner {
    animation: kit-spin 0.9s linear infinite;
  }

  :global(:root[data-motion='reduce']) .kit-spinner {
    background: currentColor;
    border-color: currentColor;
    scale: 0.6;
  }

  @keyframes kit-spin {
    to {
      rotate: 1turn;
    }
  }

  @media (forced-colors: active) {
    .kit-spinner {
      border-color: GrayText;
      border-block-start-color: CanvasText;
      forced-color-adjust: none;
    }

    :global(:root[data-motion='reduce']) .kit-spinner {
      background: CanvasText;
      border-color: CanvasText;
    }
  }
</style>
