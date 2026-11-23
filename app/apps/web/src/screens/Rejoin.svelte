<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import type { Seat } from '@wwd/engine';
  import type {
    ConnectionState,
    GameClientState,
    Localiser,
    RejoinAttempt,
  } from '@wwd/client-core';
  import { EXAMPLE_CODE, normaliseCode } from '../code.js';
  import {
    DEFAULT_SERVER,
    joinHash,
    parseServer,
    serverHost,
    startOnlineGame,
    type OnlineGame,
  } from '../online.js';
  import { hrefFor } from '../router.js';
  import { saveOnlineSession } from '../session.js';
  import Screen from '../components/Screen.svelte';
  import ServerConfirm from '../components/ServerConfirm.svelte';
  import { stopReasonText } from '../text.js';
  import { isStalePage, reloadApp } from '../pwa/update.js';

  interface Props {
    localiser: Localiser;
    /** The join code from the address, as written. */
    code?: string;
    seat?: Seat;
    /** The referee URL from the address, as written. */
    server?: string;
  }

  let { localiser: l, ...address }: Props = $props();
  const uid = $props.id();

  // The address is fixed for this screen: a new address mounts a new one.
  const initial = untrack(() => ({ ...address }));
  const linked = initial.server === undefined ? undefined : parseServer(initial.server);
  const serverInvalid = initial.server !== undefined && linked === undefined;
  const server = linked ?? DEFAULT_SERVER;
  const SEATS: readonly Seat[] = ['p0', 'p1'];
  const PIN = /^[0-9]{4}$/;

  let typedCode = $state(initial.code ?? '');
  let seat = $state<Seat | undefined>(initial.seat);
  let pin = $state('');
  let problems = $state<{ code: boolean; seat: boolean; pin: boolean }>({
    code: false,
    seat: false,
    pin: false,
  });
  let game: OnlineGame | null = null;
  let gameRoom: string | null = null;
  let cleanups: Array<() => void> = [];
  let opening = false;
  // A PIN is never typed for, or sent to, a server other than the default until the player agrees.
  let trusted = $state(server === DEFAULT_SERVER);
  let snapshot = $state.raw<GameClientState | null>(null);
  let connection = $state.raw<ConnectionState | null>(null);

  const stopText = $derived(
    connection === null
      ? null
      : stopReasonText(l, connection.stopReason, snapshot?.lastError ?? null),
  );

  function stop(): void {
    for (const cleanup of cleanups.splice(0).reverse()) cleanup();
    game?.stop();
    game = null;
    gameRoom = null;
  }

  /** Saves a granted seat and opens its game, which resumes the seat by its new token. */
  function granted(room: string, state: GameClientState): void {
    if (state.seatToken === null || opening) return;
    opening = true;
    saveOnlineSession({
      room,
      seatToken: state.seatToken,
      server,
      lastSeq: state.lastSeq,
      ...(state.seat === null ? {} : { seat: state.seat }),
    });
    queueMicrotask(() => {
      stop();
      location.hash = joinHash(room, server);
    });
  }

  function start(room: string, attempt: RejoinAttempt): void {
    if (game !== null && gameRoom === room) {
      game.rejoin(attempt);
      return;
    }
    stop();
    const started = startOnlineGame({ server, room, rejoin: attempt });
    game = started;
    gameRoom = room;
    cleanups = [
      started.client.state.subscribe((state) => {
        snapshot = state;
        granted(room, state);
      }),
      started.manager.state.subscribe((state) => (connection = state)),
    ];
  }

  /** Checks the form, asking for the PIN unless `withPin` is false; returns the room and seat. */
  function checked(withPin: boolean): { room: string; seat: Seat } | undefined {
    const room = normaliseCode(typedCode);
    problems = {
      code: room === undefined,
      seat: seat === undefined,
      pin: withPin && !PIN.test(pin),
    };
    if (room === undefined || seat === undefined || problems.pin) return undefined;
    return { room, seat };
  }

  function submit(event: SubmitEvent): void {
    event.preventDefault();
    const target = checked(true);
    if (target !== undefined) start(target.room, { seat: target.seat, pin });
  }

  function ask(): void {
    const target = checked(false);
    if (target !== undefined) start(target.room, { seat: target.seat });
  }

  onMount(() => stop);
</script>

<Screen title={l.t('rejoin-heading')} testId="rejoin" backLabel={l.t('back')}>
  {#if serverInvalid}
    <p role="alert" data-testid="server-invalid">{l.t('online-server-invalid')}</p>
  {:else if !trusted}
    <ServerConfirm localiser={l} {server} onContinue={() => (trusted = true)} />
  {:else}
    {#if server !== DEFAULT_SERVER}
      <p data-testid="server-warning">{l.t('online-server-other', { host: serverHost(server) })}</p>
    {/if}
    <form onsubmit={submit} novalidate>
      <p>
        <label for="{uid}-code">{l.t('join-code-label')}</label>
        <input
          id="{uid}-code"
          name="code"
          autocomplete="off"
          autocapitalize="characters"
          spellcheck="false"
          aria-invalid={problems.code}
          aria-describedby="{uid}-code-hint"
          data-testid="rejoin-code"
          bind:value={typedCode}
        />
      </p>
      <p id="{uid}-code-hint">{l.t('join-code-hint', { example: EXAMPLE_CODE })}</p>
      {#if problems.code}
        <p role="alert">{l.t('online-join-code-invalid')}</p>
      {/if}
      <fieldset>
        <legend>{l.t('rejoin-seat-legend')}</legend>
        {#each SEATS as option (option)}
          <label>
            <input
              type="radio"
              name="seat"
              value={option}
              data-testid="rejoin-seat-{option}"
              bind:group={seat}
            />
            {l.t(`seat-${option}`)}
          </label>
        {/each}
      </fieldset>
      {#if problems.seat}
        <p role="alert">{l.t('rejoin-seat-missing')}</p>
      {/if}
      <p>
        <label for="{uid}-pin">{l.t('rejoin-pin-label')}</label>
        <input
          id="{uid}-pin"
          name="pin"
          inputmode="numeric"
          autocomplete="off"
          maxlength="4"
          aria-invalid={problems.pin}
          aria-describedby="{uid}-pin-hint"
          data-testid="rejoin-pin"
          bind:value={pin}
        />
      </p>
      <p id="{uid}-pin-hint">{l.t('rejoin-pin-hint')}</p>
      {#if problems.pin}
        <p role="alert">{l.t('rejoin-pin-invalid')}</p>
      {/if}
      <p><button type="submit" data-testid="rejoin-submit">{l.t('rejoin-submit')}</button></p>
      <p>
        <button
          type="button"
          aria-describedby="{uid}-ask-hint"
          data-testid="rejoin-ask"
          onclick={ask}>{l.t('rejoin-ask')}</button
        >
      </p>
      <p id="{uid}-ask-hint">{l.t('rejoin-ask-hint')}</p>
    </form>
    <p role="status" data-testid="rejoin-status">
      {#if snapshot?.seatToken != null}
        {l.t('rejoin-joined')}
      {:else if snapshot?.rejoinPending === true}
        {l.t('rejoin-waiting-approval')}
      {/if}
    </p>
    {#if stopText !== null}
      <p role="alert" data-testid="rejoin-problem">{stopText}</p>
      {#if connection !== null && isStalePage(connection.stopReason, snapshot?.lastError ?? null)}
        <p>
          <button type="button" onclick={() => void reloadApp()}>{l.t('update-reload')}</button>
        </p>
      {/if}
    {/if}
  {/if}
  <p><a href={hrefFor('home')}>{l.t('back-home')}</a></p>
</Screen>
