<script lang="ts">
  import { encode } from 'uqr';

  interface Props {
    /** The text to encode; it is also the image's accessible name. */
    link: string;
    testId?: string;
  }

  let { link, testId = 'invite-qr' }: Props = $props();
  const uid = $props.id();
  const QUIET_ZONE = 2;

  const code = $derived(encode(link, { border: 0 }));
  const path = $derived(
    code.data
      .flatMap((row, y) => row.flatMap((dark, x) => (dark ? [`M${x} ${y}h1v1h-1z`] : [])))
      .join(''),
  );
  const extent = $derived(code.size + QUIET_ZONE * 2);
</script>

<svg
  class="qr"
  role="img"
  aria-labelledby="{uid}-title"
  viewBox="{-QUIET_ZONE} {-QUIET_ZONE} {extent} {extent}"
  shape-rendering="crispEdges"
  data-testid={testId}
>
  <title id="{uid}-title">{link}</title>
  <rect x={-QUIET_ZONE} y={-QUIET_ZONE} width={extent} height={extent} fill="#fff" />
  <path d={path} fill="#000" />
</svg>

<style>
  .qr {
    display: block;
    height: auto;
    inline-size: min(16rem, 100%);
    margin-inline: auto;
  }
</style>
