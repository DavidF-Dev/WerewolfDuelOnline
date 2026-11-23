<script lang="ts">
  import { onMount } from 'svelte';
  import type { Localiser } from '@wwd/client-core';
  import { getDeviceStore, patchSettings } from '../device-store.js';
  import { joinHash, rejoinHash } from '../online.js';
  import { install } from '../pwa/install.js';
  import { navigate } from '../router.js';
  import type { SessionRecord } from '../storage/db.js';
  import InstallCard from '../components/InstallCard.svelte';
  import Screen from '../components/Screen.svelte';

  interface Props {
    localiser: Localiser;
  }

  let { localiser: l }: Props = $props();
  const uid = $props.id();

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

  let sessions = $state.raw<SessionRecord[]>([]);
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
        if (active) sessions = [...records].sort((a, b) => b.savedAt - a.savedAt);
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

<Screen title={l.t('app-title')} testId="home">
  {#if sessions.length > 0}
    <section aria-labelledby="{uid}-continue">
      <h2 id="{uid}-continue">{l.t('home-continue-heading')}</h2>
      <ul>
        {#each sessions as session (session.id)}
          <li>
            <a class="session" href={continueHash(session)} data-testid="home-continue">
              <span
                >{l.t('home-continue-session', {
                  opponent: session.opponentName ?? l.t('home-opponent-unknown'),
                  room: session.room,
                })}</span
              >
              <span class="note">{l.t(STATUS_IDS[session.status])}</span>
            </a>
          </li>
        {/each}
      </ul>
    </section>
  {/if}
  <section aria-labelledby="{uid}-online">
    <h2 id="{uid}-online">{l.t('home-online-heading')}</h2>
    <ul>
      <li>
        <button
          type="button"
          data-testid="home-create-online"
          onclick={() => navigate('online-new')}>{l.t('home-create-online')}</button
        >
      </li>
      <li>
        <button type="button" data-testid="home-join-online" onclick={() => navigate('join')}
          >{l.t('home-join-online')}</button
        >
      </li>
      <li>
        <button type="button" data-testid="home-rejoin-online" onclick={() => navigate('rejoin')}
          >{l.t('home-rejoin-online')}</button
        >
      </li>
    </ul>
  </section>
  <section aria-labelledby="{uid}-local">
    <h2 id="{uid}-local">{l.t('home-local-heading')}</h2>
    <ul>
      <li>
        <button type="button" data-testid="home-host" onclick={() => navigate('local-host')}
          >{l.t('home-host')}</button
        >
      </li>
      <li>
        <button type="button" data-testid="home-join" onclick={() => navigate('local-join')}
          >{l.t('home-join')}</button
        >
      </li>
    </ul>
  </section>
  <section aria-labelledby="{uid}-more">
    <h2 id="{uid}-more">{l.t('home-more-heading')}</h2>
    <ul>
      <li>
        <button type="button" data-testid="home-how-to-play" onclick={() => navigate('how-to-play')}
          >{l.t('home-how-to-play')}</button
        >
      </li>
      <li>
        <button type="button" data-testid="home-history" onclick={() => navigate('history')}
          >{l.t('home-history')}</button
        >
      </li>
      <li>
        <button
          type="button"
          data-testid="home-settings"
          bind:this={settingsButton}
          onclick={() => navigate('settings')}>{l.t('home-settings')}</button
        >
      </li>
    </ul>
  </section>
  {#if installPlatform !== null}
    <InstallCard localiser={l} platform={installPlatform} onDismiss={dismissInstallCard} />
  {/if}
</Screen>
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

<style>
  .session {
    align-items: center;
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem 1rem;
    justify-content: space-between;
    min-height: var(--target);
  }
</style>
