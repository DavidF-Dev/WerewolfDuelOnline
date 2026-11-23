<script lang="ts">
  import type { Localiser } from '@wwd/client-core';
  import { canShare, copyText } from '../clipboard.js';
  import { groupCode } from '../code.js';
  import { inviteLink } from '../online.js';

  interface Props {
    localiser: Localiser;
    room: string;
    server: string;
  }

  let { localiser: l, room, server }: Props = $props();
  const uid = $props.id();
  const shareable = canShare();
  const link = $derived(inviteLink(room, server));
  let feedback = $state('');

  async function copy(text: string): Promise<void> {
    feedback = l.t((await copyText(text)) ? 'copy-done' : 'copy-failed');
  }

  async function share(): Promise<void> {
    try {
      await navigator.share({
        title: l.t('app-title'),
        text: l.t('invite-share-text', { code: groupCode(room) }),
        url: link,
      });
    } catch {
      // Dismissing the share sheet is not a problem worth reporting.
    }
  }
</script>

<section aria-labelledby="{uid}-heading" data-testid="invite">
  <h2 id="{uid}-heading">{l.t('invite-heading')}</h2>
  <p>{l.t('invite-instructions')}</p>
  <h3>{l.t('invite-code-label')}</h3>
  <p class="code" data-testid="invite-code">{groupCode(room)}</p>
  <p data-testid="invite-link">{l.t('invite-link', { link })}</p>
  <ul>
    <li>
      <button type="button" data-testid="copy-code" onclick={() => copy(room)}
        >{l.t('invite-copy-code')}</button
      >
    </li>
    <li>
      <button type="button" data-testid="copy-link" onclick={() => copy(link)}
        >{l.t('invite-copy-link')}</button
      >
    </li>
    {#if shareable}
      <li>
        <button type="button" data-testid="share" onclick={share}>{l.t('invite-share')}</button>
      </li>
    {/if}
  </ul>
  <p role="status" data-testid="invite-feedback">{feedback}</p>
</section>
