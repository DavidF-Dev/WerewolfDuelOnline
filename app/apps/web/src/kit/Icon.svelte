<script lang="ts" module>
  export type IconName =
    | 'back'
    | 'menu'
    | 'log'
    | 'settings'
    | 'close'
    | 'first'
    | 'previous'
    | 'next'
    | 'last'
    | 'update';
</script>

<script lang="ts">
  interface Props {
    name: IconName;
  }

  let { name }: Props = $props();
</script>

<svg
  class="icon"
  viewBox="0 0 24 24"
  aria-hidden="true"
  focusable="false"
  fill="none"
  stroke="currentColor"
  stroke-width="2"
  stroke-linecap="round"
  stroke-linejoin="round"
>
  {#if name === 'back'}
    <path d="M19 12H5M11 6l-6 6 6 6" />
  {:else if name === 'menu'}
    <path d="M4 6h16M4 12h16M4 18h16" />
  {:else if name === 'log'}
    <path d="M4 6h16M4 12h12M4 18h8" />
  {:else if name === 'first'}
    <path d="M6 6v12M18 6l-8 6 8 6z" />
  {:else if name === 'previous'}
    <path d="M16 6l-8 6 8 6z" />
  {:else if name === 'next'}
    <path d="M8 6l8 6-8 6z" />
  {:else if name === 'last'}
    <path d="M18 6v12M6 6l8 6-8 6z" />
  {:else if name === 'settings'}
    <circle cx="12" cy="12" r="6" />
    <circle cx="12" cy="12" r="2.2" />
    <circle
      cx="12"
      cy="12"
      r="8.4"
      stroke-width="3"
      stroke-linecap="butt"
      stroke-dasharray="3.3 3.3"
    />
  {:else if name === 'update'}
    <path d="M20 12a8 8 0 1 1-2.34-5.66" />
    <path d="M20 4v5h-5" />
  {:else}
    <path d="M6 6l12 12M18 6 6 18" />
  {/if}
</svg>

<style>
  .icon {
    display: block;
    height: 18px;
    width: 18px;
  }
</style>
