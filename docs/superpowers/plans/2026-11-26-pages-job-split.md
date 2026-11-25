# Pages Job Split Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** GitHub Pages deploys stop failing on their first attempt, and a failed publish can be re-run on its own.

**Why:** on 2026-11-25 three of four Pages attempts failed at `actions/deploy-pages@v4` with "No artifacts named github-pages were found for this workflow run" (and "Fetching artifact metadata failed"), although the artifact had been uploaded seconds earlier in the same job and githubstatus.com reported no issues. Re-running the job re-uploaded the site, so a second run held two artifacts with that name and failed with "Multiple artifacts named github-pages". The upload and the deploy race GitHub's artifact listing when they share a job.

**Architecture:** split the `web` job in `.github/workflows/deploy.yml` into GitHub's documented two-job pattern: `web-build` builds and uploads the Pages artifact; `web` (`needs: web-build`) only runs `actions/deploy-pages` in the `github-pages` environment. The job boundary gives the artifact time to be listed, and re-running only `web` deploys the existing artifact without uploading a duplicate.

**Spec:** this plan (a CI-only change; no app behaviour changes). `docs/deploy.md` is the deployment guide it updates.

## Global Constraints

- No git state changes by Claude; the owner commits and pushes.
- Never deploy to Cloudflare from a dev machine; the change is proven only by the deploy workflow on `main`.
- Keep every existing safeguard: the `if:` gate on `REFEREE_URL` and the production referee's result, `concurrency: pages` without cancelling, `environment: github-pages` with its URL output, least-privilege `permissions` per job, `persist-credentials: false`, the `REFEREE_URL` https check, and `BASE_PATH` from `configure-pages`.
- Keep the job names users see in the guide: the publishing job stays **Web app to GitHub Pages**.
- Action versions stay as they are (`configure-pages@v5`, `upload-pages-artifact@v3`, `deploy-pages@v4`).

## Review Focus

1. **Re-running a failed publish** must not upload a second artifact: re-running only `web` deploys the artifact `web-build` made.
2. **No production referee configured** (a fork, `settings.outputs.referee != 'true'`): `web-build` still runs and `web` follows it, as today.
3. **A failed or skipped production referee:** `web-build` is skipped, and `web` must be skipped too (not run with no artifact).
4. **Permissions:** `web-build` gets no `pages: write` or `id-token: write`; `web` gets no `contents` access it doesn't need.

---

### Task 1: Split the Pages job and update the guide

**Files:**
- Modify: `.github/workflows/deploy.yml` (the `web` job, lines ~128–175)
- Modify: `docs/deploy.md` (the job list around line 28, the first-deploy walkthrough around line 146, and a short note under troubleshooting)

- [ ] **Step 1: Split the job.**
  - `web-build`, named **Build the web app**: the current `needs`, `if`, `runs-on`, `timeout-minutes: 20`; `permissions: { contents: read, pages: read }`; steps: checkout (`persist-credentials: false`), `./.github/actions/setup-app`, `configure-pages@v5` (id `pages`), the build step unchanged, `upload-pages-artifact@v3` with `path: app/apps/web/dist`.
  - `web`, named **Web app to GitHub Pages**: `needs: web-build`; `if: needs.web-build.result == 'success'`; `runs-on: ubuntu-latest`; `timeout-minutes: 10`; `permissions: { pages: write, id-token: write }`; the existing `concurrency` and `environment` blocks; one step, `deploy-pages@v4` with `id: deployment`.
  - Move the comment about waiting for the production referee to `web-build`.
- [ ] **Step 2: Check the YAML locally.** Parse the file (for example `node -e "require('yaml').parse(require('fs').readFileSync('.github/workflows/deploy.yml','utf8'))"` from `app/`, where `yaml` is available, or `actionlint` if installed) and confirm `web.needs` is `web-build`, `web-build` keeps the old `if`, and every Review Focus item holds by reading the two jobs.
- [ ] **Step 3: Update `docs/deploy.md`.** The job list and walkthrough name both jobs: **Build the web app** builds against `REFEREE_URL` and uploads the site; **Web app to GitHub Pages** publishes it. Add one troubleshooting line: if publishing fails, re-run only **Web app to GitHub Pages** (Re-run jobs → that job), which reuses the uploaded site.
- [ ] **Step 4: Owner commits and pushes.** Suggested message: `ci(deploy): build and publish Pages in separate jobs`.
- [ ] **Step 5: Prove it on `main`.** The push runs the deploy workflow (the workflow file isn't in `paths-ignore`). After the owner approves production, **Build the web app** and **Web app to GitHub Pages** both succeed on the first attempt, and the live site still serves the current build. If publishing fails anyway, re-run only **Web app to GitHub Pages** and confirm it succeeds without a "Multiple artifacts" error.
