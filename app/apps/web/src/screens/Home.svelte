<script lang="ts">
  import { onMount, tick } from 'svelte';
  import type { Localiser } from '@wwd/client-core';
  import { getDeviceStore, patchSettings } from '../device-store.js';
  import { joinHash, rejoinHash } from '../online.js';
  import { install } from '../pwa/install.js';
  import { navigate } from '../router.js';
  import { removeOnlineSession } from '../session.js';
  import type { SessionRecord } from '../storage/db.js';
  import { describeWhen } from '../when.js';
  import Button from '../components/Button.svelte';
  import InstallCard from '../components/InstallCard.svelte';
  import NewcomerCard from '../components/NewcomerCard.svelte';
  import RemoveGameDialog from '../components/RemoveGameDialog.svelte';
  import Screen from '../components/Screen.svelte';
  import IconButton from '../kit/IconButton.svelte';
  import ListRow from '../kit/ListRow.svelte';
  import MenuButton from '../kit/MenuButton.svelte';
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
  // Shown only to a brand-new player, until dismissed; never before the settings and history are read.
  let newcomerCardWanted = $state(false);
  let settingsButton = $state<HTMLButtonElement>();
  let historyButton = $state<HTMLButtonElement>();
  const installPlatform = $derived(
    installCardWanted && ($install === 'prompt' || $install === 'ios') ? $install : null,
  );

  let removing = $state.raw<SessionRecord | null>(null);
  let removedStatus = $state('');
  let newGameButton = $state<HTMLButtonElement>();
  let sessionList = $state<HTMLElement>();

  function dismissInstallCard(): void {
    installCardWanted = false;
    settingsButton?.focus();
    void patchSettings({ installCardDismissed: true });
  }

  function dismissNewcomerCard(): void {
    newcomerCardWanted = false;
    historyButton?.focus();
    void patchSettings({ newcomerCardDismissed: true });
  }

  function showSessions(records: readonly SessionRecord[]): void {
    now = Date.now();
    sessions = [...records].sort((a, b) => b.savedAt - a.savedAt);
  }

  const moreLabel = (session: SessionRecord): string =>
    session.opponentName === undefined
      ? l.t('home-more-label-unknown')
      : l.t('home-more-label', { opponent: session.opponentName });

  async function remove(session: SessionRecord): Promise<void> {
    removing = null;
    // Emptied first, so that a second removal is announced again.
    removedStatus = '';
    const store = getDeviceStore();
    const at = sessions.findIndex((s) => s.id === session.id);
    try {
      if (store === undefined) throw new Error('no device store');
      await removeOnlineSession(store, session.server, session.room, session.seatToken);
    } catch {
      removedStatus = l.t('home-remove-failed');
      return;
    }
    removedStatus = l.t('home-removed');
    try {
      showSessions(await store.sessions.list());
    } catch {
      sessions = sessions.filter((s) => s.id !== session.id);
    }
    await tick();
    const buttons = sessionList?.querySelectorAll<HTMLElement>('[data-testid="home-more"]') ?? [];
    (buttons[Math.min(at, buttons.length - 1)] ?? newGameButton)?.focus();
  }

  onMount(() => {
    let active = true;
    const store = getDeviceStore();
    store?.settings
      .get()
      .then(async (settings) => {
        if (!active) return;
        installCardWanted = settings.firstGameFinished && !settings.installCardDismissed;
        if (settings.firstGameFinished || settings.tutorialFinished) return;
        if (settings.newcomerCardDismissed) return;
        const history = await store.history.list();
        if (active) newcomerCardWanted = history.length === 0;
      })
      .catch(() => {
        // Without the settings or the history both cards stay hidden.
      });
    store?.sessions.list().then(
      (records) => {
        if (active) showSessions(records);
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
      <ul class="sessions" bind:this={sessionList}>
        {#each sessions as session (session.id)}
          <ListRow data-testid="home-session">
            <b>{opponentOf(session)}</b>
            <div class="status">{statusOf(session)}</div>
            {#snippet end()}
              <div class="actions">
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
                <MenuButton
                  label={moreLabel(session)}
                  data-testid="home-more"
                  menuTestId="home-more-menu"
                  items={[
                    {
                      label: l.t('home-remove'),
                      'data-testid': 'home-remove',
                      onselect: () => (removing = session),
                    },
                  ]}
                />
              </div>
            {/snippet}
          </ListRow>
        {/each}
      </ul>
    </Panel>
  {/if}
  <p class="visually-hidden" role="status">{removedStatus}</p>
  {#if removing !== null}
    {@const session = removing}
    <RemoveGameDialog
      localiser={l}
      opponent={session.opponentName ?? null}
      finished={session.status === 'finished'}
      onremove={() => void remove(session)}
      oncancel={() => (removing = null)}
    />
  {/if}
  <Button
    variant="primary"
    data-testid="home-create-online"
    bind:element={newGameButton}
    onclick={() => navigate('online-new')}>{l.t('home-create-online')}</Button
  >
  <Button data-testid="home-join-online" onclick={() => navigate('join')}
    >{l.t('home-join-online')}</Button
  >
  <div class="pair">
    <Button data-testid="home-how-to-play" onclick={() => navigate('how-to-play')}
      >{l.t('home-how-to-play')}</Button
    >
    <Button
      data-testid="home-history"
      bind:element={historyButton}
      onclick={() => navigate('history')}>{l.t('home-history')}</Button
    >
  </div>
  {#if newcomerCardWanted}
    <NewcomerCard localiser={l} onDismiss={dismissNewcomerCard} />
  {/if}
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

  .actions {
    align-items: center;
    display: flex;
    gap: 8px;
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
