# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run dev` — dev server on :3000
- `npm test` — vitest unit tests (`test/*.test.ts`); single file: `npx vitest run test/html.test.ts`
- `npm run typecheck` — `tsc --noEmit` (run after build at least once so `.next/types` exist)
- `npm run build` — production build (Next.js standalone output)

## Architecture

Next.js 16 App Router app, SQLite via `@libsql/client` + Drizzle, deployed as a
single container (see `Dockerfile`; mount `/data`). One replica only: SQLite on
an RWO volume plus an in-process scheduler. Deployment is deliberately
unopinionated — no bundled manifests; the README documents the contract.

The flow that ties everything together:

1. **Auth** (`src/server/medicover/auth.ts`) — server-side OIDC+PKCE login
   against `login-online24.medicover.pl` (client_id `web`). Password login may
   be interrupted by MFA (`MfaInteractionRequired`); the pending state (cookie
   jar + parsed Razor form) is held in-memory and driven to completion by the
   Settings "connect wizard" via `/api/medicover/connect*` routes. Tokens +
   stable device id persist in the `settings` kv table (`src/server/settings.ts`),
   so refresh-token logins are non-interactive afterwards. `ensureAccessToken()`
   is the single entry point for getting a token.
2. **API client** (`src/server/medicover/client.ts`) — v2 gateway endpoints
   (`api-gateway-online24.medicover.pl`): filters (dictionaries), slot search,
   person appointments, personal data, and benefit-plans (coverage). Multi-region
   searches run one request per region and merge; extra refinements (end date,
   hour window, doctor-name substring) are applied client-side in
   `src/server/medicover/slots.ts` (pure, unit-tested). Gateway quirks (verified
   live): the filters endpoint 409s (CIS_ERROR) without `RegionIds` — the full
   regions list is fetched with a seed region; clinics/doctors only populate
   when `SpecialtyIds` is also present; benefit-plans responses wrap in
   `{result: [...]}`; the services autocomplete with an empty `QueryString`
   pages through the entire catalog. No public OpenAPI spec exists (404s).
3. **Monitors** (`src/server/monitors/`) — `engine.ts` runs one monitor: search
   → dedupe against `found_slots` (sha1 of date+doctor+clinic+specialty per
   monitor) → Pushover notify (templates in `src/server/notify/messages.ts`,
   PL/EN per monitor). `scheduler.ts` ticks every 30 s from `src/instrumentation.ts`
   and runs due monitors serially; `nextRunAt` lives in the DB so restarts resume.
4. **DB** (`src/server/db/`) — schema bootstraps at runtime via idempotent
   `CREATE TABLE IF NOT EXISTS` (no migrations needed for fresh containers);
   keep `schema.ts` and the `BOOTSTRAP` DDL in `index.ts` in sync when changing tables.
5. **UI** — client components fetching the `/api/*` routes via `usePoll`
   (`src/lib/client.ts`). Design tokens live in `src/app/globals.css`
   (Tailwind v4 `@theme`): clinic blue / found green / paper palette, Geist +
   Geist Mono. Settings values pinned by env vars come back in the `locked`
   array from `/api/settings` and render disabled in the GUI (env wins over DB;
   see `envSettings()` in `src/server/settings.ts`).

Modules importing `server-only` can't be imported by vitest — keep pure logic
in dedicated files (like `slots.ts`, `html.ts`, `cookiejar.ts`) to test it.

## Constraints & gotchas

- `.env` holds real Medicover credentials — never commit it; it seeds
  `MEDICOVER_USER`/`MEDICOVER_PASS` on first boot.
- Medicover requires MFA enrollment on accounts without one; the full login
  can only be completed interactively once (code entry in Settings). Don't
  hammer password logins when debugging — accounts lock after failed attempts.
- `slot.appointmentDate` is Poland-local ISO **without** timezone; format via
  string ops (`formatSlotDate`), never `new Date(...)`.
- Releases: Conventional Commits on `main` → Release Please PR → merge tags
  vX.Y.Z and CI pushes the GHCR image (`.github/workflows/release.yml`).
