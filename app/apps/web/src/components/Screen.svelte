<script lang="ts">
  import type { Snippet } from 'svelte';
  import { goBack } from '../router.js';
  import AppBar from './AppBar.svelte';

  interface Props {
    title: string;
    testId: string;
    children: Snippet;
    actions?: Snippet;
    /** The accessible name of the back button; without it there is none. */
    backLabel?: string;
  }

  let { title, testId, children, actions, backLabel }: Props = $props();
  const uid = $props.id();
</script>

<AppBar {title} headingId="{uid}-heading" {actions} {backLabel} onback={goBack} />
<main aria-labelledby="{uid}-heading" data-testid={testId}>
  {@render children()}
</main>
