<script lang="ts">
  import { resolveArt } from '../themes/resolve.js';

  const url = resolveArt('placeholder', 'scenery', 'treeline');
</script>

<div
  class="scenery"
  data-part="scenery"
  aria-hidden="true"
  style:mask-image={`url("${url}")`}
></div>

<style>
  .scenery {
    background: var(--scenery);
    bottom: 0;
    height: 120px;
    left: 0;
    mask-position: center bottom;
    mask-repeat: no-repeat;
    mask-size: cover;
    opacity: var(--scenery-o);
    pointer-events: none;
    position: absolute;
    right: 0;
    z-index: -1;
  }

  @media (forced-colors: active) {
    .scenery {
      background: GrayText;
      forced-color-adjust: none;
    }
  }
</style>
