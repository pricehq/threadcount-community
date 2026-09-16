# Self-hosting ThreadCount (Community edition)

The Community edition is the hosted product with `EDITION=community` in its environment. This
page says what that changes, how to run it, how to keep it, and what is not included.

## What `EDITION=community` changes

The Community edition is the product a single room uses, and nothing that belongs to the hosted
service. Its source is an export of the hosted code with the hosted-only parts left out.

| | Hosted (threadcount.tech) | Community |
|---|---|---|
| Coordinator app (`/app`), phone counter (`/m`), staff app (`/my`) | Yes | Yes, in full |
| Plans, staff ceiling, read-only for non-payment | Yes | None. Every facility behaves as a grandfathered one. |
| Website, pricing, guides, legal pages | Yes | Not included. `/` goes to sign-in. |
| Demo facility | Yes | Not included |
| Health-service layer (organisations, shared catalogue) | Yes | Not included |
| Single sign-on (SAML/OIDC) | Yes | Not included. Password plus authenticator code. |
| Card payments | Where configured | Not included |
| Cloudflare Turnstile on sign-in and sign-up | Required | Optional. Set both keys to enforce it; without it the per-address rate limits stand alone. |
| Error reports | To ThreadCount's own GlitchTip, scrubbed | Nowhere, unless you set `NEXT_PUBLIC_GLITCHTIP_DSN` to your own |
| Usage statistics | To ThreadCount's own Umami, scrubbed | Nowhere. The tracker only mounts on `*.threadcount.tech`. |
| Transactional email | ThreadCount's SMTP | Your SMTP, or none |

Your instance is yours, and so is the privacy statement your staff read. The product's screens
link to the terms and the privacy notice from a few places (the staff sign-in, account screens);
set `NEXT_PUBLIC_TERMS_URL` and `NEXT_PUBLIC_PRIVACY_URL` to your own documents before you build,
or they point at threadcount.tech's.

## Running it

`docker-compose.yml` runs three services: `db` (Postgres 16, in a named volume), `migrate` (a
one-shot `prisma migrate deploy` that runs before the app on every `up`), and `app` (Next.js's
standalone server, port 3000, photographs in a second named volume). Put TLS in front of port
3000. A minimal Caddyfile:

```
uniforms.example.health {
    reverse_proxy 127.0.0.1:3000
}
```

The image is built on your machine, not pulled, because `NEXT_PUBLIC_SITE_URL` and the optional
Turnstile site key are compiled into the browser bundle. If you change either, rebuild:
`docker compose up -d --build`.

### The first facility

Open the hostname. Create an account; that creates a facility and makes you its administrator.
Under Settings, name your staff groups first (nothing works until a facility has them), then load
the catalogue, departments, staff register, barcodes and opening stock from CSV under Settings ›
Data. Add a second administrator under Settings › Account › Users before you sign out — a
forgotten password with one admin and no SMTP locks the facility.

Then set `SIGNUPS_DISABLED=1` in `.env` and `docker compose up -d`. Your instance is now one
facility, and nobody else can create another.

## Upgrading

Each release replaces the repository's history rather than adding to it, so a plain `git pull`
refuses to merge. Fetch and move to the release instead. Your `.env` is not tracked and stays put.

```sh
git fetch origin
git reset --hard origin/main
docker compose up -d --build
```

`migrate` applies any new schema migrations before the new app starts; the old app keeps
serving until then. Take a backup first (below). Releases that need more than that say so in
their notes.

## Backups

`docker/backup.sh <directory>` writes one directory per run: the database as a custom-format
`pg_dump` and the photographs as a tarball, keeping the last fourteen. Run it nightly from cron:

```
30 3 * * * cd /srv/threadcount && docker/backup.sh /srv/backups/threadcount >> /var/log/threadcount-backup.log 2>&1
```

Copy that directory somewhere off the machine. A backup on the same disk as the database is not a
backup.

Separately, an administrator can download the whole facility as one JSON file from Settings ›
Data at any time, and restore it into a fresh instance from the same screen. That file is the
portable form; the `pg_dump` is the fast one.

### Restoring

```sh
docker compose down
docker volume rm threadcount_db threadcount_photos     # only if you mean to replace everything
docker compose up -d db
docker compose exec -T db pg_restore -U threadcount -d threadcount --clean --if-exists < 2026-09-13-033001/threadcount.dump
docker compose up -d
docker compose cp 2026-09-13-033001/photos app:/data/   # after extracting photos.tgz
```

## The Android apps

The two Play apps (ThreadCount, the counter; ThreadCount Staff) can point at your server. On the
app's first screen tap "Server: threadcount.tech · Change", choose Self-hosted, and enter your
hostname. The app checks it over HTTPS (it calls `/api/app-info`, which every ThreadCount server
answers), saves it on the phone, and opens your counter or staff screens from then on. The choice is
per phone; "Change" is always on the first screen, and the sign-in screens show which server they
are talking to.

Two things stay tied to threadcount.tech's domain and do not carry over: emailed approval links
opening straight in the staff app (they open in the browser instead, and work there), and saved
passwords shared between the website and the app. The phone must be able to reach your server over
HTTPS with a certificate it trusts; a self-signed certificate is refused.

Without the apps, the same screens work in a phone's browser: `https://your-host/m` for the
counter (camera scanning works in Chrome and Edge) and `https://your-host/my` for staff.

## Environment reference

`.env.example` lists every variable the application reads, with a comment on each. The ones that
matter for a Community instance are `SESSION_SECRET`, `POSTGRES_PASSWORD`, `NEXT_PUBLIC_SITE_URL`,
`EDITION`, `NEXT_PUBLIC_TERMS_URL`, `NEXT_PUBLIC_PRIVACY_URL`, the `SMTP_*` group, and
`SIGNUPS_DISABLED`. Leave the Turnstile and GlitchTip variables empty unless you run those yourself.

## Getting help

Open an issue on the repository. If you would rather someone else ran it, that is what
[threadcount.tech/pricing](https://threadcount.tech/pricing) is for.
