<script lang="ts">
  import type { Localiser } from '@wwd/client-core';
  import type { RulesConfig, Seat } from '@wwd/engine';
  import Chip from '../kit/Chip.svelte';
  import Label from '../kit/Label.svelte';
  import Note from '../kit/Note.svelte';
  import Panel from '../kit/Panel.svelte';
  import { canShare, copyText } from '../clipboard.js';
  import { groupCode } from '../code.js';
  import { inviteLink } from '../online.js';
  import Button from './Button.svelte';
  import QrCode from './QrCode.svelte';
  import WaitingStatus from './WaitingStatus.svelte';

  interface Props {
    localiser: Localiser;
    room: string;
    server: string;
    /** Set for a room continued from a save, whose game stays paused until both players resume. */
    resumed?: boolean;
    /** Shows the panel's heading; without it the heading is left to the screen's title. */
    titled?: boolean;
    /** The room's rules, shown as chips once known. */
    config?: RulesConfig | null;
    /** This device's seat, which the Badge chip is read from. */
    seat?: Seat | null;
    /** Set once the opponent has connected, before their game starts. */
    opponentJoined?: boolean;
  }

  let {
    localiser: l,
    room,
    server,
    resumed = false,
    titled = true,
    config = null,
    seat = null,
    opponentJoined = false,
  }: Props = $props();
  const uid = $props.id();
  const link = $derived(inviteLink(room, server));
  let feedback = $state('');

  const options = $derived.by(() => {
    if (config === null) return [];
    const start = config.badge_start;
    const badge =
      start === 'random' ? 'random' : seat !== null && start.seat === seat ? 'you' : 'opponent';
    return [
      l.t(`invite-option-badge-${badge}`),
      l.t('invite-option-tiebreak', { rule: l.t(`create-tiebreak-${config.tiebreak}`) }),
      l.t('invite-option-min-targets', { count: config.min_targets }),
    ];
  });

  async function copy(text: string): Promise<void> {
    feedback = l.t((await copyText(text)) ? 'copy-done' : 'copy-failed');
  }

  async function share(): Promise<void> {
    if (!canShare()) {
      await copy(link);
      return;
    }
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

<section class="invite" aria-labelledby="{uid}-heading" data-testid="invite">
  <h2 id="{uid}-heading" class={['heading', { 'visually-hidden': !titled }]}>
    {l.t('invite-heading')}
  </h2>
  {#if resumed}
    <Note>{l.t('invite-instructions-resumed')}</Note>
  {/if}
  <Panel class="code-panel">
    <Label as="h3">{l.t('invite-code-label')}</Label>
    <p class="code" data-testid="invite-code">{groupCode(room)}</p>
    <div class="qr-frame"><QrCode {link} /></div>
    <div class="buttons">
      <Button size="small" data-testid="copy-code" onclick={() => copy(room)}
        >{l.t('invite-copy-code')}</Button
      >
      <Button size="small" variant="primary" data-testid="share" onclick={share}
        >{l.t('invite-share')}</Button
      >
    </div>
    <p class="link" data-testid="invite-link">{l.t('invite-link', { link })}</p>
    <p class="feedback" role="status" data-testid="invite-feedback">{feedback}</p>
  </Panel>
  {#if options.length > 0}
    <Panel>
      <ul class="options" aria-label={l.t('invite-options')} data-testid="invite-options">
        {#each options as option (option)}
          <li><Chip>{option}</Chip></li>
        {/each}
      </ul>
    </Panel>
  {/if}
  <WaitingStatus
    text={l.t(opponentJoined ? 'invite-joined' : 'invite-waiting')}
    state={opponentJoined ? 'done' : 'waiting'}
    testId="invite-waiting"
  />
</section>

<style>
  .invite {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .heading {
    font-size: 1.0625rem;
    font-weight: 400;
    margin: 0;
  }

  .invite :global(.code-panel) {
    text-align: center;
  }

  .code {
    font-family: var(--font-mono);
    font-size: 1.875rem;
    font-weight: 800;
    letter-spacing: 0.12em;
    line-height: 1;
    margin: 0;
  }

  .qr-frame {
    border: 1px solid var(--line);
    inline-size: min(9.5rem, 100%);
    margin: 6px auto;
  }

  .buttons {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    justify-content: center;
  }

  .link {
    color: var(--muted);
    font-size: 0.71875rem;
    margin: 8px 0 0;
    overflow-wrap: anywhere;
  }

  .feedback {
    font-size: 0.75rem;
    margin: 0;
  }

  .options {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .options li {
    margin: 0;
  }
</style>
