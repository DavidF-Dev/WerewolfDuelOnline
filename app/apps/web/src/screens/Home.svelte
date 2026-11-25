<script lang="ts">
  import { onMount } from 'svelte';
  import type { Localiser } from '@wwd/client-core';
  import { getDeviceStore, patchSettings } from '../device-store.js';
  import { joinHash, rejoinHash } from '../online.js';
  import { install } from '../pwa/install.js';
  import { navigate } from '../router.js';
  import type { SessionRecord } from '../storage/db.js';
  import { describeWhen } from '../when.js';
  import Button from '../components/Button.svelte';
  import InstallCard from '../components/InstallCard.svelte';
  import Screen from '../components/Screen.svelte';
  import IconButton from '../kit/IconButton.svelte';
  import ListRow from '../kit/ListRow.svelte';
  import Panel from '../kit/Panel.svelte';

  interface Props {
    localiser: Localiser;
  }

  let { localiser: l }: Props = $props();

  const STATUS_IDS: Record<SessionRecord['status'], string> = {
    active: 'home-status-active',
    paused: 'home-status-paused',
    finished: 'home-status-finished',
  };

  const PHYSICAL_GAME_URL = 'https://boardgamegeek.com/boardgame/436306/werewolf-duel#buyacopy';

  // A stored seat token resumes the seat directly; without one only the PIN flow can.
  const continueHash = (session: SessionRecord): string =>
    // A save already continued in a new room goes on there.
    session.resumedAs !== undefined
      ? joinHash(session.resumedAs, session.server, session.seat)
      : session.seatToken === ''
        ? rejoinHash(session.room, session.seat ?? null, session.server)
        : joinHash(session.room, session.server);

  const opponentOf = (session: SessionRecord): string =>
    session.opponentName ?? l.t('home-opponent-unknown');

  function statusOf(session: SessionRecord): string {
    const when = describeWhen(session.savedAt, now, l.locale);
    const round = session.round;
    if (round !== undefined) {
      if (session.status === 'paused') return l.t('home-status-paused-round', { round, when });
      if (session.status === 'active') {
        if (session.yourTurn === undefined) return l.t('home-status-round', { round, when });
        return l.t(session.yourTurn ? 'home-status-turn' : 'home-status-waiting', { round, when });
      }
    }
    return l.t('home-status-line', { status: l.t(STATUS_IDS[session.status]), when });
  }

  let sessions = $state.raw<SessionRecord[]>([]);
  let now = $state(Date.now());
  // Shown once the first game is finished, until dismissed; never before the settings are read.
  let installCardWanted = $state(false);
  let settingsButton = $state<HTMLButtonElement>();
  const installPlatform = $derived(
    installCardWanted && ($install === 'prompt' || $install === 'ios') ? $install : null,
  );

  function dismissInstallCard(): void {
    installCardWanted = false;
    settingsButton?.focus();
    void patchSettings({ installCardDismissed: true });
  }

  onMount(() => {
    let active = true;
    const store = getDeviceStore();
    store?.settings.get().then(
      (settings) => {
        if (active)
          installCardWanted = settings.firstGameFinished && !settings.installCardDismissed;
      },
      () => {
        // Without the settings the card stays hidden.
      },
    );
    store?.sessions.list().then(
      (records) => {
        if (active) {
          now = Date.now();
          sessions = [...records].sort((a, b) => b.savedAt - a.savedAt);
        }
      },
      () => {
        // Without stored sessions there is nothing to continue.
      },
    );
    return () => {
      active = false;
    };
  });
</script>

<Screen title={l.t('app-title')} brand testId="home">
  {#snippet right()}
    <IconButton
      icon="settings"
      label={l.t('home-settings')}
      data-testid="home-settings"
      bind:element={settingsButton}
      onclick={() => navigate('settings')}
    />
  {/snippet}
  {#if sessions.length > 0}
    <Panel title={l.t('home-continue-heading')}>
      <ul class="sessions">
        {#each sessions as session (session.id)}
          <ListRow data-testid="home-session">
            <b>{opponentOf(session)}</b>
            <div class="status">{statusOf(session)}</div>
            {#snippet end()}
              <Button
                size="small"
                variant={session.status === 'active' ? 'primary' : 'default'}
                href={continueHash(session)}
                aria-label={l.t(
                  session.status === 'finished' ? 'home-open-label' : 'home-resume-label',
                  {
                    opponent: opponentOf(session),
                    room: session.room,
                  },
                )}
                data-testid="home-continue"
                >{l.t(session.status === 'finished' ? 'home-open' : 'home-resume')}</Button
              >
            {/snippet}
          </ListRow>
        {/each}
      </ul>
    </Panel>
  {/if}
  <Button variant="primary" data-testid="home-create-online" onclick={() => navigate('online-new')}
    >{l.t('home-create-online')}</Button
  >
  <Button data-testid="home-join-online" onclick={() => navigate('join')}
    >{l.t('home-join-online')}</Button
  >
  <div class="pair">
    <Button data-testid="home-how-to-play" onclick={() => navigate('how-to-play')}
      >{l.t('home-how-to-play')}</Button
    >
    <Button data-testid="home-history" onclick={() => navigate('history')}
      >{l.t('home-history')}</Button
    >
  </div>
  {#if installPlatform !== null}
    <InstallCard localiser={l} platform={installPlatform} onDismiss={dismissInstallCard} />
  {/if}
  {#snippet pageFooter()}
    <footer data-testid="footer">
      <p>{l.t('footer-made-by')}</p>
      <p data-testid="unofficial-notice">{l.t('footer-unofficial')}</p>
      <p>{l.t('footer-not-affiliated')}</p>
      <p>
        <a
          href={PHYSICAL_GAME_URL}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={l.t('footer-get-game-label')}
          data-testid="physical-game-link">{l.t('footer-get-game')}</a
        >
      </p>
    </footer>
  {/snippet}
</Screen>

<style>
  .sessions {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .status {
    color: var(--muted);
    font-size: 0.75rem;
  }

  .pair {
    display: flex;
    gap: 10px;
  }

  .pair :global(.button) {
    flex: 1 1 0;
    width: auto;
  }

  footer {
    color: var(--muted);
    font-size: 0.71875rem;
    line-height: 1.6;
    max-width: none;
    padding-inline: 0;
    text-align: center;
  }

  footer p {
    margin: 0;
  }
</style>
