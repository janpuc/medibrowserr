# Contributing

Thanks for wanting to help! This is a small self-hosted app — the bar for a
good PR is low, but a few things really matter.

## The one hard rule: Conventional Commits

Releases, version numbers and the changelog are fully automated with
[Release Please](https://github.com/googleapis/release-please). It reads
[Conventional Commits](https://www.conventionalcommits.org) from `main`:

- `fix: …` → patch release, `feat: …` → minor, `feat!:`/`BREAKING CHANGE:` → major
- `docs:`, `chore:`, `ci:`, `test:`, `refactor:` — no release, still welcome

PRs are squash-merged, so the **PR title** should be a valid conventional
commit line — it becomes the commit on `main`.

## Dev setup

```bash
npm install
npm run dev        # http://localhost:3000
npm test           # vitest unit tests (no network, no account needed)
npm run typecheck
npm run build
```

You only need a real Medicover account for live testing: put
`MEDICOVER_USER` / `MEDICOVER_PASS` in `.env` (gitignored) and connect in
Settings (one-time MFA code). **Be gentle with the live API** — keep sweep
intervals sane and don't hammer password logins; accounts lock after a few
failures.

## Where things live

| Area | Path |
| --- | --- |
| Medicover login (OIDC+PKCE, MFA orchestration) | `src/server/medicover/auth.ts` |
| API client (filters, slots, coverage) | `src/server/medicover/client.ts` |
| Monitor engine & scheduler | `src/server/monitors/` |
| Coverage index seeder | `src/server/coverage/` |
| Pushover + message templates (PL/EN) | `src/server/notify/` |
| HTTP API | `src/app/api/**` |
| UI pages/components | `src/app/**`, `src/components/` |

Architecture notes and API gotchas are in [CLAUDE.md](CLAUDE.md) — read it
before touching the login flow or the gateway client.

Keep pure logic in dependency-free modules (like `medicover/slots.ts`,
`medicover/html.ts`, `coverage/verdict.ts`) so it stays unit-testable —
modules importing `server-only` can't be loaded by vitest.

## Database changes

The schema bootstraps at runtime (`src/server/db/index.ts`). For new columns
on existing tables, add an idempotent `ALTER TABLE` to the migrations list
there **and** mirror the change in `schema.ts`. Never assume a fresh
database.

## What gets a PR merged fast

- Tests for new logic (`test/*.test.ts`)
- `npm test`, `npm run typecheck`, `npm run build` green (CI checks all three)
- No secrets in code, fixtures or logs — ever
- One change per PR
