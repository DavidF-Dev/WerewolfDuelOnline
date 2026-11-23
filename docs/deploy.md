# Deploying Werewolf: Duel! Online

This guide sets up the public deployment: the web app on GitHub Pages and the referee on
Cloudflare Workers, both deployed by the `deploy` GitHub Actions workflow. It also covers an
optional custom domain and self-hosting the referee with Docker.

Throughout, `<github-user>` is the GitHub account that owns the repository and `<repo>` is the
repository's name.

## What goes where

| Piece           | Where                                                                                        |
| --------------- | -------------------------------------------------------------------------------------------- |
| Web app         | GitHub Pages: `https://<github-user>.github.io/<repo>/`, or a custom domain                  |
| Referee         | Cloudflare Worker `wwd-referee`: `https://wwd-referee.davidfdev.workers.dev`                 |
| Staging referee | Cloudflare Worker `wwd-referee-staging`: `https://wwd-referee-staging.davidfdev.workers.dev` |

The workflow (`.github/workflows/deploy.yml`) runs on every push to `main`, except a push that
changes only `docs/` or Markdown files, and on demand (Actions → deploy → Run workflow). Its
jobs run in this order:

1. **Read the deployment settings** checks which secrets and variables are set. Nothing is
   deployed that isn't configured, so the workflow stays green on a fresh fork.
2. **Referee to Cloudflare staging** deploys the staging Worker, then runs the smoke test
   (`scripts/smoke.mjs`) against it.
3. **Referee to Cloudflare production** runs only if staging passed. It waits for your approval
   (section 3), deploys the production Worker and smoke-tests it.
4. **Web app to GitHub Pages** builds the app against `REFEREE_URL` and publishes it. It runs only
   when `REFEREE_URL` is set.

The two referee jobs run only when both Cloudflare secrets and the `APP_ORIGINS` and
`STAGING_REFEREE_URL` variables are set. When they are, the web app waits for the production
referee and is published only if that deploy succeeded, so the site never goes live ahead of the
referee it talks to. If staging fails or you reject the production deploy, the site isn't updated
either. When the referee isn't configured, the web job runs on its own.

## 1. Cloudflare

You need a Cloudflare account on the free plan and your workers.dev subdomain (Workers & Pages →
your subdomain; the owner's is `davidfdev`, which gives the URLs used as examples in this
guide). The Worker names `wwd-referee` and `wwd-referee-staging` come from
`app/packages/referee-cloudflare/wrangler.toml`, so the referees are at
`https://wwd-referee.<your-subdomain>.workers.dev` and
`https://wwd-referee-staging.<your-subdomain>.workers.dev`.

Create an API token for the workflow:

1. My Profile → API Tokens → Create Token → **Create Custom Token**.
2. Name it, for example, `wwd deploy`.
3. Permissions:
   - Account → **Workers Scripts** → **Edit**
   - Account → **Account Settings** → **Read**
4. Account Resources: Include → your account.
5. Leave Zone Resources and Client IP Address Filtering empty: GitHub's runners have no fixed
   addresses. An expiry date is optional; if you set one, put a reminder in your calendar.
6. Create the token and copy it. Cloudflare shows it only once.

Copy your **Account ID** too. It's shown on the Workers & Pages overview page.

## 2. GitHub secrets and variables

In the repository, open Settings → Secrets and variables → Actions.

**Secrets** (the Secrets tab → New repository secret). Make them repository secrets, not
environment secrets, because both referee jobs use them:

| Secret                  | Value                      |
| ----------------------- | -------------------------- |
| `CLOUDFLARE_API_TOKEN`  | The token from step 1      |
| `CLOUDFLARE_ACCOUNT_ID` | Your Cloudflare account ID |

**Variables** (the Variables tab → New repository variable). The values shown are the owner's;
a fork uses its own workers.dev subdomain:

| Variable              | Value                                               | Used by                                      |
| --------------------- | --------------------------------------------------- | -------------------------------------------- |
| `REFEREE_URL`         | `https://wwd-referee.davidfdev.workers.dev`         | The web build, and the production smoke test |
| `STAGING_REFEREE_URL` | `https://wwd-referee-staging.davidfdev.workers.dev` | The staging smoke test                       |
| `APP_ORIGINS`         | `https://<github-user>.github.io`                   | The referees' allowed browser origins        |

About `APP_ORIGINS`:

- It's a comma-separated list of **origins**: scheme and host only, with no `/<repo>` path and no
  trailing slash. A project site at `https://<github-user>.github.io/<repo>/` has the origin
  `https://<github-user>.github.io`.
- Only `https://` origins are accepted. The settings job fails the run on anything else,
  including `*`, so production can never allow every origin.
- The production referee allows exactly these origins.
- The staging referee allows these origins plus `http://localhost:5173` and
  `http://localhost:4173`, so that a local dev server or `vite preview` build can be pointed at
  it:

  ```sh
  cd app
  VITE_REFEREE_URL=https://wwd-referee-staging.davidfdev.workers.dev pnpm --filter @wwd/web dev
  ```

- The smoke test sends no `Origin` header, which the referee allows, so it needs no entry.
- The committed `wrangler.toml` leaves `ALLOWED_ORIGINS` empty for both environments, so a
  referee deployed without a list lets no browser in. The workflow passes the real list through
  the package's `deploy:staging` and `deploy:production` scripts, which refuse to run without one
  (see "Deploying by hand" below).

## 3. The production environment

Production deploys wait for a reviewer:

1. Settings → Environments → New environment → name it `production`.
2. Tick **Required reviewers** and add yourself.
3. Under Deployment branches and tags, choose **Selected branches and tags** and add `main`. This
   is required: it stops a workflow run on any other branch from using the environment.
4. Save the protection rules.

Whether required reviewers are available depends on your GitHub plan and on whether the
repository is public; see GitHub's documentation on deployment environments. **Without required
reviewers, production deploys straight after staging passes its smoke test.**

Each push to `main` asks for a production approval. Approve the runs you want to ship, and reject
the rest.

## 4. GitHub Pages

Settings → Pages → Build and deployment → Source: **GitHub Actions**. GitHub then creates the
`github-pages` environment that the web job deploys to. Under Settings → Environments →
`github-pages`, check that Deployment branches and tags allows only `main`, as for
`production`.

GitHub Pages is free for public repositories. A private repository needs a paid plan.

The web job asks Pages for the site's base path, so a project site is built for `/<repo>/` and a
custom domain for `/`. To try a sub-path build locally:

```sh
cd app
BASE_PATH=/<repo> VITE_REFEREE_URL=https://wwd-referee.davidfdev.workers.dev pnpm --filter @wwd/web build
```

## 5. The first deploy

1. Push to `main`, or run the workflow from the Actions tab.
2. Watch the run:
   - **Read the deployment settings** prints a notice if something isn't set yet.
   - **Referee to Cloudflare staging** ends with `Smoke test passed for https://wwd-referee-staging.davidfdev.workers.dev`.
   - **Referee to Cloudflare production** waits. Choose Review deployments → `production` →
     Approve and deploy.
   - **Web app to GitHub Pages** starts once production has deployed, and prints the site's URL
     when it's done.
3. Open `https://<github-user>.github.io/<repo>/`, create an online game, and join it from a
   second browser or device with the invite link.

You can run the smoke test from your own machine at any time with Node 24:

```sh
node scripts/smoke.mjs https://wwd-referee.davidfdev.workers.dev
```

It makes four requests (up to seven if `/health` needs retrying while a fresh deploy comes up)
and creates one room, which is deleted after 30 days without activity. `--timeout <ms>` (default
30 s) limits the whole run, and `--retry-delay <ms>` (default 3 s) sets the wait between health
checks.

## 6. Optional: a custom domain for the app

You need a domain whose DNS you can edit. The examples use `duel.<your-domain>`.

1. At your DNS provider, add a record: `CNAME duel → <github-user>.github.io`.
2. Settings → Pages → Custom domain: enter `duel.<your-domain>` and Save. Wait for the DNS check to
   pass.
3. Tick **Enforce HTTPS**. GitHub issues the certificate, which can take a while.
4. Add the new origin to `APP_ORIGINS`, for example
   `https://duel.<your-domain>,https://<github-user>.github.io`.
5. Run the workflow again. The web job now builds for `/`, and the referees allow the new origin.

GitHub redirects the github.io address to the custom domain. To stop anyone else from claiming
the domain on GitHub, verify it under your account's Settings → Pages.

## 7. Optional: a custom domain for the referee

This needs a domain whose DNS is on Cloudflare. The workers.dev URL is invisible to players, so
this is cosmetic.

1. Workers & Pages → `wwd-referee` → Settings → Domains & Routes → Add → Custom domain. Enter, for
   example, `referee.<your-domain>`. Cloudflare creates the DNS record and certificate.
2. Change the `REFEREE_URL` variable to `https://referee.<your-domain>` and run the workflow, so
   the web app uses it.

`wrangler deploy` manages only the routes listed in `wrangler.toml`, so a domain added in the
dashboard should survive deploys; check Domains & Routes after the next one. To manage it in code
instead, add
`routes = [{ pattern = "referee.<your-domain>", custom_domain = true }]` under
`[env.production]` and give the API token Zone → Workers Routes → Edit for that zone.

Both addresses serve the same Worker, so games in progress and invite links made before the
change keep working.

## 8. Self-hosting the referee with Docker

The Node referee serves the same HTTP API and WebSocket protocol as the Cloudflare one, and keeps
rooms as files in a volume.

Build the image from the repository root (BuildKit, the default in current Docker, is required):

```sh
docker build -f app/packages/referee-node/Dockerfile -t wwd-referee .
```

Run it:

```sh
docker run -d --name wwd-referee --restart unless-stopped \
  -p 8787:8787 -v wwd-data:/data \
  wwd-referee --origins https://<your-app-origin>
```

- The image always listens on port 8787 on all interfaces and keeps rooms in `/data`. To publish
  another port, change the host side of `-p`, for example `-p 9000:8787`.
- Arguments after the image name go to the referee:
  - `--origins <list>`: comma-separated browser origins allowed to call it. Without it, no browser
    can use the referee.
  - `--trust-proxy`: rate-limit by the last `X-Forwarded-For` hop. Use it only behind exactly one
    reverse proxy that appends that header.
  - `--test-overrides`: for tests only. Never use it on a public server.
- The container runs as uid 1000. A bind-mounted host directory instead of the `wwd-data` volume
  must be writable by that user.
- The files in `/data` hold seat tokens and PINs. Keep the volume private.

Browsers on an `https://` page can only reach a `wss://` referee, so put the container behind a
reverse proxy that terminates TLS, for example Caddy with `reverse_proxy localhost:8787`, and add
`--trust-proxy`. Then check it:

```sh
node scripts/smoke.mjs https://referee.<your-domain>
```

The public app creates rooms on its own default referee. To have games created on yours, build
the web app with `VITE_REFEREE_URL=https://referee.<your-domain>` (plus `BASE_PATH` when it's
served under a sub-path) and host `app/apps/web/dist` on any static HTTPS host. Players can still
join a room on another referee through an invite link with `?server=`, after confirming the
server.

## 9. Costs and limits

Everything here fits in free tiers for a hobby deployment. Free-tier limits change, so check the
current pricing pages before relying on these figures.

- **GitHub Pages:** free for public repositories. Sites are limited to about 1 GB, with a soft
  bandwidth limit of about 100 GB a month.
- **GitHub Actions:** free on public repositories. A private repository has a monthly allowance
  of free minutes. Each deploy builds the engine in up to three jobs, and the Rust cache keeps
  that quick.
- **Cloudflare Workers free plan:** about 100,000 requests a day across Workers and Durable
  Objects, with daily limits on Durable Object duration and storage operations. Incoming
  WebSocket messages count as a fraction of a request each, and a hibernating idle game costs
  nothing. That's roughly 500 games a day.
- **Each deploy** runs the smoke test twice (staging and production): eight to fourteen requests
  and two rooms.
- **The referee's own limits:**
  - 20 room-creation attempts per IP address per hour, counting refused ones such as invalid
    requests, not only rooms created. On Cloudflare this is counted per Worker isolate, not
    globally.
  - 8 connections per room.
  - 30 messages per connection per 10 seconds, each at most 8 KiB.
  - Rooms are deleted 24 hours after their game ends, or after 30 days without activity.

## 10. Troubleshooting

- **The settings job prints "The referee is not deployed".** One of the two secrets or the
  `APP_ORIGINS` or `STAGING_REFEREE_URL` variables is missing.
- **The settings job fails on `APP_ORIGINS`.** An entry isn't an `https://` origin. Remove any
  path, trailing slash or wildcard.
- **The app says it can't reach the server, and the browser console shows a CORS or 403 error.**
  The page's origin isn't in `APP_ORIGINS`. Add it and run the workflow again.
- **A smoke test fails.** The message names the step and the reason, for example
  `Smoke test failed for https://… while creating a room: expected 201 {code}, got 429 …`. A `429`
  means 20 room-creation attempts came from that address in the last hour; wait and run it
  again.
- **A bad referee release.** Workers & Pages → the Worker → Deployments lets you roll back to an
  earlier version.
- **Deploying by hand.** Use the package scripts, which pass `--env` and refuse to deploy
  without allowed origins, with a wildcard, with a non-`https` origin (staging also accepts
  `http://localhost:<port>`), with any `TEST_OVERRIDES` value, or with `--env`, `-e`, `--name`,
  `--config` or `-c` of your own:

  ```sh
  cd app
  pnpm --filter "@wwd/referee-cloudflare..." build
  pnpm --filter @wwd/referee-cloudflare run deploy:staging --var "ALLOWED_ORIGINS:https://<github-user>.github.io"
  ```

  Run `wrangler login` first. Never run `wrangler deploy` without `--env`: the top-level
  configuration's Worker is also named `wwd-referee`, so it would replace production with a
  Worker that allows no origins.
