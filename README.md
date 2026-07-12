# medibrowserr

Self-hosted appointment watcher for **Medicover Poland**. It sweeps the
Medicover OnLine (online24) API for free slots on your schedule, keeps the
finds in SQLite, and pings you on **Pushover** the moment something new
appears — with default messages in Polish or English, your pick per monitor.

Inspired by [medihunter](https://github.com/apqlzm/medihunter), rebuilt as a
proper web app for a Kubernetes homelab.

## Features

- **Monitors** — saved searches that run on an interval (default 15 min):
  - one or more **regions**, one or more **specialties**
  - one or more **clinics** (or all in the region)
  - specific **doctors** picked from the live dictionary, or a free-text
    "doctor name contains" filter
  - date range, hour-of-day window, doctor language, consultation vs
    diagnostic procedure
- **Pushover notifications** with sensible default messages (PL/EN chosen when
  you create the monitor), priority per monitor, test button in Settings.
- **Coverage checker** — searches your Medicover benefit plan and shows
  whether a service is covered, limited or discounted.
- **Appointments** — every caught slot as a waiting-room ticket, plus your
  actually-booked visits from Medicover.
- **ZnanyLekarz enrichment** — best-effort doctor photo, rating and profile
  link on each ticket (can be disabled in Settings).
- **SQLite** storage, single container, no external services.

## How login works (read this once)

Medicover's online24 login is OIDC with PKCE, driven server-side by the app.
Since 2025 Medicover **requires an MFA method on every account**. The first
time you connect:

1. Enter card number + password in **Settings** (or seed via env vars).
2. Click **Connect**. If your account has no MFA method yet, the app walks
   you through the one-time setup: pick **Email** or **SMS**, receive a
   6-digit code, type it in.
3. The app marks its device as trusted and stores the refresh token in
   SQLite — from then on everything is automatic, across restarts.

If Medicover ever demands a new code (e.g. token revoked), monitors pause,
you get a Pushover "action required" ping, and the Settings page shows the
code prompt again.

## Quick start (docker compose)

```bash
docker compose up -d
# open http://localhost:3000 → Settings → connect Medicover + Pushover
```

## Kubernetes

Manifests live in [`deploy/k8s`](deploy/k8s): PVC + single-replica
Deployment (Recreate strategy — SQLite on RWO storage) + Service, optional
Ingress example and Secret template.

```bash
kubectl apply -k deploy/k8s
```

> **Security note:** the app has no built-in authentication. Keep it on an
> internal network, or put basic-auth / an auth proxy in front of the
> Ingress. Your Medicover password and tokens live in the SQLite database on
> the PVC.

## Configuration

| Env var | Purpose | Default |
| --- | --- | --- |
| `DATABASE_URL` | SQLite location (`sqlite://` or `file:` URL) | `sqlite:///data/medibrowserr.db` (image) |
| `MEDICOVER_USER` / `MEDICOVER_PASS` | Seed Medicover login on first boot | — |
| `PUSHOVER_TOKEN` / `PUSHOVER_USER` | Seed Pushover credentials | — |
| `TZ` | Timezone for schedules/dates | `Europe/Warsaw` (image) |

Everything is also editable in the UI; UI values win over env seeds.

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
