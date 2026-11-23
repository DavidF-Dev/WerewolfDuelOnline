# @wwd/referee-node

The Node referee for Werewolf: Duel! Online. It serves the shared HTTP API and the room
WebSockets, keeps each room in memory and saves it as `<data>/<CODE>.json` after every change.

## Run

```sh
pnpm --filter "@wwd/referee-node..." build
pnpm --filter @wwd/referee-node start --port 8787 --origins https://play.example.com
```

| Flag               | Default   | Meaning                                                                                                               |
| ------------------ | --------- | --------------------------------------------------------------------------------------------------------------------- |
| `--port`           | `8787`    | Port to listen on (`0` picks a free one)                                                                              |
| `--host`           | `0.0.0.0` | Address to bind                                                                                                       |
| `--data`           | `./data`  | Directory for room snapshot files                                                                                     |
| `--origins`        | none      | Comma-separated browser origins allowed to call the API                                                               |
| `--test-overrides` | off       | Honours `test` room options and allows `http://localhost:*` origins; never in production                              |
| `--trust-proxy`    | off       | Rate-limits by the last `X-Forwarded-For` hop; use only behind exactly one reverse proxy that appends X-Forwarded-For |

The listening URL is printed to stdout once the server is ready (`localhost` for a wildcard bind); logs go to stderr. `SIGINT`/`SIGTERM` close every
connection and finish pending writes before exiting.

## Behaviour

- Rooms load lazily from their file on the first connection; an unreadable file is logged and
  the room is treated as missing.
- An upgrade for a well-formed code with no servable room (missing, expired, unreadable or
  quarantined) is accepted, sent `error{unknown_room}` and closed with 1008; it never takes one
  of a room's connection slots. A malformed code gets `404`.
- A room whose engine faults has its sockets closed with 1011 and is dropped from memory; its
  last good file is kept.
- Expired rooms (idle 30 days, or finished 24 hours ago) and their files are removed hourly.
- A socket that sends nothing for 75 seconds, or leaves over 1 MiB of output unread, is closed.
- A room that faults three times within an hour has its file renamed to `<CODE>.faulted.json`
  and is no longer served; such files are deleted after 24 hours.
- Logs never contain seat tokens, PINs or message bodies.

## Docker

From the repository root:

```sh
docker build -f app/packages/referee-node/Dockerfile -t wwd-referee .
docker run -p 8787:8787 -v wwd-data:/data wwd-referee --origins https://play.example.com
```

The build needs BuildKit (the default in current Docker), which reads `Dockerfile.dockerignore`.
The image runs as the unprivileged `node` user (uid 1000) and keeps rooms in the `/data`
volume; a bind-mounted host directory must be writable by uid 1000.
