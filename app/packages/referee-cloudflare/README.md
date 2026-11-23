# @wwd/referee-cloudflare

The Cloudflare referee for Werewolf: Duel! Online. A Worker serves the shared HTTP API and hands
each room's WebSockets to that room's Durable Object (one per join code), which uses the
WebSocket Hibernation API, an alarm and SQLite-backed storage.

## Run locally

```sh
pnpm --filter "@wwd/referee-cloudflare..." build
pnpm --filter @wwd/referee-cloudflare dev     # wrangler dev with test overrides on
pnpm --filter @wwd/referee-cloudflare test    # Vitest inside local workerd, then the deploy-script tests in Node
```

Nothing here talks to Cloudflare: `dev` and `test` run workerd locally, and `build` is
`wrangler deploy --dry-run`, which only bundles.

## Configuration

| Variable          | Meaning                                                                                    |
| ----------------- | ------------------------------------------------------------------------------------------ |
| `ALLOWED_ORIGINS` | Comma-separated browser origins allowed to call the API                                    |
| `TEST_OVERRIDES`  | `"1"` honours `test` room options and allows `http://localhost:*` origins; never deploy it |

`wrangler.toml` has a `staging` (`wwd-referee-staging`) and a `production` (`wwd-referee`)
environment. Both leave `ALLOWED_ORIGINS` empty, so a referee deployed without a list lets no browser in.
`deploy:staging` and `deploy:production` (`scripts/deploy.mjs`) take the list as an extra
argument (`pnpm deploy:staging --var ALLOWED_ORIGINS:https://…`) and refuse to run without one,
with a wildcard, with a non-`https` origin (staging also accepts `http://localhost:<port>`) or
with `TEST_OVERRIDES` other than `"0"`. They need a Cloudflare login; the `deploy` GitHub Actions
workflow uses them with the repository's variables. The repository's `docs/deploy.md` is the deployment guide.

## Behaviour

- `POST /rooms` asks the object named by the new code to create the room; it answers `409` if
  that code is taken, and the shared service then draws another code.
- The room is kept in storage under `room` and rewritten only when its revision changes; a
  faulted room is never written.
- Each socket's attachment holds its connection id, its seat once welcomed and its timestamps.
  An object woken from hibernation restores the room as it was, keeping grace deadlines and any
  pending rejoin request, and rebinds every seated socket. A second socket claiming the same seat
  is told `superseded`, and other waiting sockets are closed with 1001. A wake that changes
  nothing writes nothing and sends nothing.
- `{"type":"ping"}` is answered with `{"type":"pong"}` by the runtime without waking the object.
- One alarm covers the room's next deadline, its expiry, and each socket's idle and hello
  timeouts. A socket that sends nothing (pings included) for 75 seconds is closed with 1001, and
  one not welcomed within 10 seconds with 1008.
- Expired rooms (idle 30 days, or finished 24 hours ago) are told `room_closed` and deleted with
  all their storage.
- A room whose engine faults has its sockets closed with 1011 and is dropped from memory; the
  next connection, or an alarm a minute later, restores its last saved state. Three faults
  within an hour quarantine it: the snapshot is deleted, upgrades are turned away as unknown, and
  the marker is removed after 24 hours.
- A stored room that cannot be restored is kept (upgrades are turned away as unknown) and is
  deleted at its idle expiry if it still cannot be restored then.
- An upgrade for a well-formed code with no servable room is accepted, sent
  `error{unknown_room}` and closed with 1008, on a socket that never counts towards the room's
  connections. A malformed code gets `404`.
- Logs never contain seat tokens, PINs or message bodies.

## Differences from the Node referee

- The room-creation rate limit (20 attempts per IP per hour, keyed on `CF-Connecting-IP`) is counted per
  Worker isolate, not globally, so a client reaching several isolates gets more. That is accepted
  for a hobby deployment.
- Workers' `WebSocket` has no `bufferedAmount`, so there is no send backpressure check; the
  runtime buffers output itself.
