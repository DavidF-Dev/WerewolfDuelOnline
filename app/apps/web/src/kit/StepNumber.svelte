<script lang="ts">
  /** A step's or section's number in a circle, decorative beside the text that names it. */
  interface Props {
    n: number;
  }

  let { n }: Props = $props();
</script>

<span class="kit-step-number" aria-hidden="true">{n}</span>

<style>
  .kit-step-number {
    align-items: center;
    background: var(--surface-2);
    border: 1px solid var(--line);
    border-radius: 50%;
    display: flex;
    flex: none;
    font-family: var(--font-label);
    font-weight: 700;
    height: 1.75rem;
    justify-content: center;
    width: 1.75rem;
  }
</style>
