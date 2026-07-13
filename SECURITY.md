# Security Policy

## Reporting a vulnerability

Please **do not open a public issue** for security problems. Use GitHub's
[private vulnerability reporting](../../security/advisories/new) ("Report a
vulnerability" on the Security tab). You'll get a response within a week.

## Supported versions

Only the latest release (`ghcr.io/janpuc/medibrowserr:latest`) is supported.

## Threat model — what you should know as an operator

medibrowserr is a **single-user homelab app** that holds real credentials:

- Your Medicover password, OAuth tokens and trusted-device id live in the
  SQLite database on the `/data` volume. Anyone with that file can access
  your medical account. Protect the volume like a password.
- The app ships **without authentication by default**. Run it on an internal
  network, behind an auth proxy, or set `MEDIBROWSERR_BASIC_AUTH` at minimum.
  The container should never be directly internet-facing.
- API responses from Medicover (your name, MRN, visits, plan) are proxied to
  whoever can reach the app — same rule as above.
- HSTS / X-Frame-Options headers are deliberately not set (plain-HTTP homelab
  reverse-proxy setups); terminate TLS and add them at your proxy if exposed.

Hardening already in place: non-root container, no dependency install
scripts (`npm ci --ignore-scripts`), env-pinned settings, Zod-validated API
inputs, secrets redacted in API responses.
