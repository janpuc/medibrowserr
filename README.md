# medibrowserr

Self-hosted appointment watcher for **Medicover Poland**. It sweeps the
Medicover OnLine (online24) API for free slots on your schedule, keeps the
finds in SQLite, and pings you on **Pushover** the moment something new
appears — with default messages in Polish or English, your pick per monitor.

Inspired by [medihunter](https://github.com/apqlzm/medihunter), rebuilt as a
proper web app for self-hosting.

## Features

- **Monitors** — saved searches that run on an interval (default 15 min):
  pick a specialty and go; regions, clinics, interval and language come from
  your configured defaults. Narrow to specific clinics, doctors from the live
  dictionary or a "doctor name contains" filter, date/hour windows, doctor
  language, consultation vs diagnostic. **Preview results** before saving.
- **Pushover notifications** with sensible default messages (PL/EN chosen when
  you create the monitor), priority per monitor, test button in Settings.
- **Coverage checker** — browse or search the full Medicover service catalog
  and see how *your* plan treats each service: covered, referral required,
  volume/value limits (with usage), discount or payable.
- **Appointments** — every caught slot as a waiting-room ticket, plus your
  booked visits from Medicover.
- **SQLite** storage, single container, no external services.

## How login works (read this once)

Medicover's online24 login is OIDC with PKCE, driven server-side by the app.
Medicover **requires an MFA method on every account**. The first time you
connect:

1. Enter card number + password in **Settings** (or seed via env vars).
2. Click **Connect**. If your account has no MFA method yet, the app walks
   you through the one-time setup: pick **Email** or **SMS**, receive a
   6-digit code, type it in.
3. The app marks its device as trusted and stores the refresh token in
   SQLite — from then on everything is automatic, across restarts.

If Medicover ever demands a new code (e.g. token revoked), monitors pause,
you get a Pushover "action required" ping, and the Settings page shows the
code prompt again.

## Running it

```bash
docker compose up -d
# open http://localhost:3000 → Settings → connect Medicover + Pushover
```

Or with plain `docker run` / any orchestrator — the image is unopinionated:

```bash
docker run -d -p 3000:3000 -v medibrowserr-data:/data \
  ghcr.io/janpuc/medibrowserr:latest
```

What the container needs:

| Mount / port | Purpose |
| --- | --- |
| `/data` (volume, **required**) | SQLite database: settings, Medicover session (tokens + trusted device), monitors, caught slots. Lose it and you redo the MFA dance. |
| `3000/tcp` | HTTP. Health endpoint: `GET /api/health`. |

There is no cache directory — fonts and assets are baked into the image at
build time, and dictionaries are fetched live.

Run **exactly one instance** per database: SQLite plus the in-process
scheduler don't share. On Kubernetes that means `replicas: 1` with a
`Recreate` strategy and a ReadWriteOnce PVC mounted at `/data`.

> **Security note:** the app has no built-in authentication. Keep it on an
> internal network, or put basic-auth / an auth proxy in front of it. Your
> Medicover password and tokens live in the SQLite database.

## Configuration

Everything is configurable in the Settings page. Env vars are optional
overrides — a value set via env **wins over the GUI and shows up locked**
(grayed out) there:

| Env var | Purpose |
| --- | --- |
| `DATABASE_URL` | SQLite location (`sqlite://` or `file:` URL). Image default: `sqlite:///data/medibrowserr.db` |
| `MEDICOVER_USER` / `MEDICOVER_PASS` | Medicover card number / password |
| `PUSHOVER_TOKEN` / `PUSHOVER_USER` / `PUSHOVER_DEVICE` | Pushover app token / user key / device |
| `MEDIBROWSERR_DEFAULT_REGION_IDS` | Regions preselected in new monitors, comma-separated ids (e.g. `202` = Kraków) |
| `MEDIBROWSERR_DEFAULT_CLINIC_IDS` | Clinics preselected in new monitors, comma-separated ids |
| `MEDIBROWSERR_DEFAULT_LANGUAGE` | Default notification language, `pl` or `en` |
| `MEDIBROWSERR_DEFAULT_INTERVAL` | Default sweep interval in minutes |
| `TZ` | Timezone for schedules/dates. Image default: `Europe/Warsaw` |

Region/clinic ids are visible in the Settings pickers (or via
`GET /api/medicover/filters`).

## Development

```bash
npm install
npm run dev        # http://localhost:3000
npm test           # vitest unit tests
npm run typecheck
npm run build
```

Put `MEDICOVER_USER` / `MEDICOVER_PASS` in `.env` (gitignored) to seed your
login during development.

## Releases

Hands-off via [Release Please](https://github.com/googleapis/release-please):
use [Conventional Commits](https://www.conventionalcommits.org) (`feat:`,
`fix:`…) on `main`, merge the release PR it opens, and CI publishes
`ghcr.io/<owner>/medibrowserr` with `:X.Y.Z`, `:X.Y`, `:X`, `:latest` tags.
Every push to `main` also publishes `:edge` + `:sha-<short>` for the brave.

## Disclaimer

Unofficial, not affiliated with Medicover. It automates the same requests
your browser makes, gently (default 15-minute sweeps, single flight). Use at
your own risk and be considerate with intervals.
