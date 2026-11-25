<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import type { Seat } from '@wwd/engine';
  import type {
    ConnectionState,
    GameClientState,
    Localiser,
    RejoinAttempt,
  } from '@wwd/client-core';
  import { normaliseCode } from '../code.js';
  import {
    DEFAULT_SERVER,
    joinHash,
    parseServer,
    serverHost,
    startOnlineGame,
    type OnlineGame,
  } from '../online.js';
  import { saveOnlineSession } from '../session.js';
  import Button from '../components/Button.svelte';
  import CodeField from '../components/CodeField.svelte';
  import Screen from '../components/Screen.svelte';
  import ServerConfirm from '../components/ServerConfirm.svelte';
  import Label from '../kit/Label.svelte';
  import Note from '../kit/Note.svelte';
  import Panel from '../kit/Panel.svelte';
  import Segmented from '../kit/Segmented.svelte';
  import Spinner from '../kit/Spinner.svelte';
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
  const seatOptions = SEATS.map((option) => ({
    value: option,
    label: l.t(`seat-${option}`),
    testId: `rejoin-seat-${option}`,
  }));
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

<Screen title={l.t('rejoin-heading')} testId="rejoin" back={l.t('back')}>
  {#if serverInvalid}
    <p role="alert" data-testid="server-invalid">{l.t('online-server-invalid')}</p>
  {:else if !trusted}
    <ServerConfirm localiser={l} {server} onContinue={() => (trusted = true)} />
  {:else}
    {#if server !== DEFAULT_SERVER}
      <Note data-testid="server-warning"
        >{l.t('online-server-other', { host: serverHost(server) })}</Note
      >
    {/if}
    <form class="rejoin-form" onsubmit={submit} novalidate>
      <Panel class="rejoin-panel">
        <CodeField
          localiser={l}
          bind:value={typedCode}
          invalid={problems.code}
          error={l.t('online-join-code-invalid')}
          testId="rejoin-code"
        />
        <div>
          <Label id="{uid}-seat">{l.t('rejoin-seat-legend')}</Label>
          <Segmented
            labelledby="{uid}-seat"
            stretch
            value={seat ?? ''}
            options={seatOptions}
            onchange={(value) => (seat = value === '' ? undefined : value)}
          />
          {#if problems.seat}
            <p class="error" role="alert">{l.t('rejoin-seat-missing')}</p>
          {/if}
        </div>
        <div class="field">
          <Label as="label" for="{uid}-pin">{l.t('rejoin-pin-label')}</Label>
          <input
            id="{uid}-pin"
            class="pin"
            name="pin"
            inputmode="numeric"
            autocomplete="off"
            maxlength="4"
            aria-invalid={problems.pin}
            aria-describedby="{uid}-pin-hint"
            data-testid="rejoin-pin"
            bind:value={pin}
          />
          <p id="{uid}-pin-hint" class="hint">{l.t('rejoin-pin-hint')}</p>
          {#if problems.pin}
            <p class="error" role="alert">{l.t('rejoin-pin-invalid')}</p>
          {/if}
        </div>
        <Button type="submit" variant="primary" data-testid="rejoin-submit"
          >{l.t('rejoin-submit')}</Button
        >
        <div class="field">
          <Button aria-describedby="{uid}-ask-hint" data-testid="rejoin-ask" onclick={ask}
            >{l.t('rejoin-ask')}</Button
          >
          <p id="{uid}-ask-hint" class="hint">{l.t('rejoin-ask-hint')}</p>
        </div>
      </Panel>
    </form>
    <p class="message" role="status" data-testid="rejoin-status">
      {#if snapshot?.seatToken != null}
        {l.t('rejoin-joined')}
      {:else if snapshot?.rejoinPending === true}
        {l.t('rejoin-waiting-approval')}<Spinner />
      {/if}
    </p>
    {#if stopText !== null}
      <p class="message" role="alert" data-testid="rejoin-problem">{stopText}</p>
      {#if connection !== null && isStalePage(connection.stopReason, snapshot?.lastError ?? null)}
        <Button onclick={() => void reloadApp()}>{l.t('update-reload')}</Button>
      {/if}
    {/if}
  {/if}
</Screen>

<style>
  .rejoin-form :global(.rejoin-panel) {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .pin {
    font-family: var(--font-mono);
    font-size: 1.5rem;
    font-weight: 800;
    letter-spacing: 0.3em;
    text-align: center;
    width: 100%;
  }

  .hint,
  .error,
  .message {
    font-size: 0.75rem;
    margin: 0;
  }

  .hint {
    color: var(--muted);
  }

  .error {
    color: var(--danger);
    font-weight: 600;
    margin-top: 4px;
  }
</style>
