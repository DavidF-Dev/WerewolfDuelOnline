<script lang="ts">
  import type { Seat } from '@wwd/engine';
  import type { Localiser } from '@wwd/client-core';
  import { copyText } from '../clipboard.js';
  import { groupCode } from '../code.js';
  import { rejoinLink } from '../online.js';
  import QrCode from './QrCode.svelte';

  interface Props {
    localiser: Localiser;
    room: string;
    seat: Seat;
    server: string;
    /** This seat's PIN; it reaches the page only once the player asks to see it. */
    pin: string | null;
  }

  let { localiser: l, room, seat, server, pin }: Props = $props();
  const uid = $props.id();
  const link = $derived(rejoinLink(room, seat, server));
  let revealed = $state(false);
  let feedback = $state('');

  async function copy(): Promise<void> {
    feedback = l.t((await copyText(link)) ? 'copy-done' : 'copy-failed');
  }

  function toggled(event: Event): void {
    if (!(event.currentTarget as HTMLDetailsElement).open) revealed = false;
  }
</script>

<details data-testid="continue-elsewhere" ontoggle={toggled}>
  <summary>{l.t('continue-heading')}</summary>
  <p>{l.t('continue-instructions')}</p>
  <p>{l.t('continue-code', { code: groupCode(room) })}</p>
  <p>{l.t('continue-seat', { seat: l.t(`seat-${seat}`) })}</p>
  <p data-testid="rejoin-link">{l.t('continue-link', { link })}</p>
  <p>
    <button type="button" data-testid="copy-rejoin-link" onclick={copy}
      >{l.t('continue-copy-link')}</button
    >
  </p>
  <p role="status">{feedback}</p>
  <p>{l.t('continue-qr-hint')}</p>
  <QrCode {link} testId="rejoin-qr" />
  {#if pin !== null}
    <p>
      <button
        type="button"
        data-testid="toggle-pin"
        aria-expanded={revealed}
        aria-controls="{uid}-pin"
        onclick={() => (revealed = !revealed)}
        >{l.t(revealed ? 'continue-hide-pin' : 'continue-show-pin')}</button
      >
    </p>
    <div id="{uid}-pin">
      {#if revealed}
        <p class="code" data-testid="pin">{l.t('continue-pin', { pin })}</p>
        <p>{l.t('continue-pin-hint')}</p>
      {/if}
    </div>
  {/if}
</details>
