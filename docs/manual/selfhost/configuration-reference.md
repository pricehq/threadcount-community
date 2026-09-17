---
title: Configuration reference
section: selfhost
order: 6
summary: Every environment variable the application reads, whether it is required, its default and what it does.
role: Self-hosting admin
keywords: configuration, environment, variables, env, .env, settings, reference, session secret, smtp, turnstile, signups disabled, app port, edition, source url
---

## How settings are read

Settings go in `.env` in the checkout. `docker-compose.yml` passes the whole file to the `app` container, then sets five values itself, and those win over `.env`:

| Variable | Set by compose to |
|---|---|
| `DATABASE_URL` | The bundled `db` service, using `POSTGRES_PASSWORD` |
| `EDITION` | `community` |
| `PHOTO_DIR` | `/data/photos` |
| `PORT` | `3000` |
| `HOSTNAME` | `0.0.0.0` |

Variables starting `NEXT_PUBLIC_` are compiled into the app when the image is built. The build does not read `.env`: compose passes four of them in as build arguments, `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_TURNSTILE_SITEKEY`, `NEXT_PUBLIC_TERMS_URL` and `NEXT_PUBLIC_PRIVACY_URL`. Any other `NEXT_PUBLIC_` variable in `.env` has no effect on a Docker install. A change to one of those four needs `docker compose up -d --build`; any other change needs `docker compose up -d`.

The repository's `.env.example` lists every variable the application reads, with a comment on each.

## Required

| Variable | Default | What it does |
|---|---|---|
| `SESSION_SECRET` | `change-me` | Signs every session cookie. The server refuses to start with the placeholder or with none. Make one with `openssl rand -base64 48`. |
| `POSTGRES_PASSWORD` | none | The bundled database's password. Compose refuses to start without it. |
| `NEXT_PUBLIC_SITE_URL` | `http://localhost:3000` | The address people open. Every link in an email is built from it. Build-time. |
| `EDITION` | none | `community`. Makes Turnstile optional and stops error reports being sent anywhere. Compose sets it for you. |
| `DATABASE_URL` | set by compose | The Postgres connection. Required outside compose. |

## Mail

See [email](/docs/selfhost/email).

| Variable | Default | What it does |
|---|---|---|
| `SMTP_HOST` | none | Mail server. Mail is on only when this, `SMTP_USER` and `SMTP_PASS` are all set. |
| `SMTP_PORT` | `587` | `465` connects with TLS from the start. |
| `SMTP_USER` | none | Mail server login |
| `SMTP_PASS` | none | Mail server password |
| `SMTP_FROM` | `SMTP_USER` | The From line |

## Notifications

| Variable | Default | What it does |
|---|---|---|
| `TC_FCM_KEY_FILE` | none | Path to a Firebase service-account key file, kept outside the checkout. With none, no notifications are sent and the staff app's Account screen says so. See [notifications](/docs/selfhost/notifications). |

## Switches and the server

| Variable | Default | What it does |
|---|---|---|
| `SIGNUPS_DISABLED` | open | `1` hides facility sign-up and refuses the sign-up endpoint. |
| `APP_PORT` | `3000` | The port on the server the app is published on. Compose reads it; the container always listens on 3000. |
| `PHOTO_DIR` | set by compose | Where signatures and photos are written. Back it up with the database. |
| `SOURCE_URL` | the release this build came from | Where this server's source can be had, shown on the sign-in page and in the app. ThreadCount is AGPL-3.0-only: if you have changed the code and other people use your server, point this at wherever you keep your version. |
| `TURNSTILE_SECRET` | none | Cloudflare Turnstile on sign-in, sign-up and password reset. Enforced only when set. |
| `NEXT_PUBLIC_TURNSTILE_SITEKEY` | none | Turnstile's site key. Build-time. Set both or neither. |
| `TURNSTILE_OPTIONAL` | none | `1` lets production run without Turnstile. For local tests; a Community instance does not need it. |
| `DB_POOL_MAX` | the driver's default | Local development only. `1` makes every database call wait for the one before. Never set it on a server. |

## Documents, errors and statistics

`NEXT_PUBLIC_TERMS_URL` and `NEXT_PUBLIC_PRIVACY_URL` are passed into the build by compose, so setting them and rebuilding works. The rest are `NEXT_PUBLIC_` variables compose does not pass, so as the first section explains, they have no effect on a Docker install today.

| Variable | Default | What it does |
|---|---|---|
| `NEXT_PUBLIC_TERMS_URL` | none | Your terms page, linked from the staff sign-in and account screens. With none, no link shows. |
| `NEXT_PUBLIC_PRIVACY_URL` | none | Your privacy notice, linked the same way |
| `NEXT_PUBLIC_GLITCHTIP_DSN` | none | Your own GlitchTip or other Sentry-protocol address for error reports. With none, nothing is reported. |
| `NEXT_PUBLIC_RELEASE` | none | A label stamped on error reports; also shown as `version` at `/api/app-info` when there is no `COMMUNITY_VERSION` file |
| `NEXT_PUBLIC_UMAMI_SRC` | none | Your own Umami tracker script. With none, no statistics are sent. |
| `NEXT_PUBLIC_UMAMI_SITE_ID` | none | Umami site id |
| `NEXT_PUBLIC_UMAMI_APP_ID` | none | Umami id for the app |

A variable not listed on this page is not read by the application. Anything left over in an old `.env` can be deleted.
