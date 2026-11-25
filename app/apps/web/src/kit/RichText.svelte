<script lang="ts">
  import type { RichPart } from '@wwd/client-core';
  import MarkerIcon from '../components/MarkerIcon.svelte';

  interface Props {
    /** A message split by `richMessage`; it reads as the plain message. */
    parts: readonly RichPart[];
  }

  let { parts }: Props = $props();
</script>

<span class="rich-text" data-part="rich-text"
  >{#each parts as part, i (i)}{#if 'text' in part}{part.text}{:else if 'player' in part}<strong
        >{part.player}</strong
      >{:else if 'character' in part}<strong>{part.character}</strong>{:else}<MarkerIcon
        marker={part.marker}
        label={part.label}
      />{/if}{/each}</span
>
