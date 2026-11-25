<script lang="ts">
  import { resolveArt } from '../themes/resolve.js';

  const art = (id: 'treeline' | 'treeline-wide' | 'treeline-band'): string =>
    `url("${resolveArt('placeholder', 'scenery', id)}")`;
</script>

<div
  class="scenery"
  data-part="scenery"
  aria-hidden="true"
  style:--treeline={art('treeline')}
  style:--treeline-wide={art('treeline-wide')}
  style:--treeline-band={art('treeline-band')}
></div>

<style>
  .scenery {
    background: var(--scenery);
    bottom: 0;
    height: 120px;
    left: 0;
    mask-image: var(--treeline);
    mask-position: center bottom;
    mask-repeat: no-repeat;
    mask-size: cover;
    opacity: var(--scenery-o);
    pointer-events: none;
    position: absolute;
    right: 0;
    z-index: -1;
  }

  /* Wider than the column, the wide drawing keeps its own height and the plain band carries on past its ends. */
  @media (width > 30rem) {
    .scenery {
      mask-image: var(--treeline-wide), var(--treeline-band);
      mask-repeat: no-repeat, repeat-x;
      mask-size: auto 120px;
    }
  }

  @media (forced-colors: active) {
    .scenery {
      background: GrayText;
      forced-color-adjust: none;
    }
  }
</style>
