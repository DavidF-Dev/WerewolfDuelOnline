<script lang="ts">
  import type { Localiser } from '@wwd/client-core';
  import { navigate } from '../router.js';

  interface Props {
    localiser: Localiser;
  }

  let { localiser: l }: Props = $props();
  const uid = $props.id();

  const PHYSICAL_GAME_URL = 'https://boardgamegeek.com/boardgame/436306/werewolf-duel#buyacopy';
</script>

<main aria-labelledby="{uid}-heading" data-testid="home">
  <h1 id="{uid}-heading">{l.t('app-title')}</h1>
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
</main>
<footer data-testid="footer">
  <p>{l.t('footer-made-by')}</p>
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
