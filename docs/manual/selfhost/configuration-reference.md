---
title: Configuration reference
section: selfhost
order: 6
summary: Every environment variable, whether it is required, its default and what it does, with the hosted-only ones marked.
role: Self-hosting admin
keywords: configuration, environment, variables, env, .env, settings, reference, session secret, smtp, turnstile, signups disabled, app port, edition, hosted only
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

Variables starting `NEXT_PUBLIC_` are compiled into the app when the image is built. The build does not read `.env`: compose passes only `NEXT_PUBLIC_SITE_URL` and `NEXT_PUBLIC_TURNSTILE_SITEKEY` into it. Any other `NEXT_PUBLIC_` variable in `.env` has no effect on a Docker install. A change to either of those two needs `docker compose up -d --build`; any other change needs `docker compose up -d`.

The repository's `.env.example` lists the variables the Community edition reads. The tables below also list the ones only threadcount.tech uses, marked hosted only, so you know they can stay blank.

## Required

| Variable | Default | What it does |
|---|---|---|
| `SESSION_SECRET` | `change-me` | Signs every session cookie. The server refuses to start with the placeholder or with none. Make one with `openssl rand -base64 48`. |
| `POSTGRES_PASSWORD` | none | The bundled database's password. Compose refuses to start without it. |
| `NEXT_PUBLIC_SITE_URL` | `http://localhost:3000` | The address people open. Every link in an email is built from it. Build-time. |
| `EDITION` | none | `community`. Turns off plans, the staff ceiling, the demo and reporting to ThreadCount, and makes Turnstile optional. |
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
| `CONTACT_TO` | none | Hosted only. Where the website's contact form is delivered. |

## Switches and the server

| Variable | Default | What it does |
|---|---|---|
| `SIGNUPS_DISABLED` | open | `1` hides facility sign-up and refuses the sign-up endpoint. |
| `APP_PORT` | `3000` | The port on the server the app is published on. Compose reads it; the container always listens on 3000. |
| `PHOTO_DIR` | set by compose | Where signatures and photos are written. Back it up with the database. |
| `TURNSTILE_SECRET` | none | Cloudflare Turnstile on sign-in, sign-up and password reset. Enforced only when set. |
| `NEXT_PUBLIC_TURNSTILE_SITEKEY` | none | Turnstile's site key. Build-time. Set both or neither. |
| `TURNSTILE_OPTIONAL` | none | `1` lets production run without Turnstile. For local tests; a Community instance does not need it. |
| `DB_POOL_MAX` | the driver's default | Local development only. `1` makes every database call wait for the one before. Never set it on a server. |

## Documents, errors, statistics and chat

These are all `NEXT_PUBLIC_` variables, so as the first section explains, they have no effect on a Docker install today.

| Variable | Default | What it does |
|---|---|---|
| `NEXT_PUBLIC_TERMS_URL` | none | Your terms page, linked from the staff sign-in and account screens. With none, no link shows. |
| `NEXT_PUBLIC_PRIVACY_URL` | none | Your privacy notice, linked the same way |
| `NEXT_PUBLIC_GLITCHTIP_DSN` | none | Your own GlitchTip or other Sentry-protocol address for error reports. With none, nothing is reported. |
| `NEXT_PUBLIC_RELEASE` | none | A label stamped on error reports; also shown as `version` at `/api/app-info` when there is no `COMMUNITY_VERSION` file |
| `NEXT_PUBLIC_UMAMI_SRC` | none | Your own Umami tracker script. With none, no statistics are sent. |
| `NEXT_PUBLIC_UMAMI_SITE_ID` | none | Umami site id |
| `NEXT_PUBLIC_UMAMI_APP_ID` | none | Umami id for the app |
| `NEXT_PUBLIC_CHATWOOT_URL` | none | Your own Chatwoot. With this and the token set, a chat widget shows in the coordinator app. |
| `NEXT_PUBLIC_CHATWOOT_TOKEN` | none | Chatwoot website token |

## Hosted only

Nothing in the Community edition reads these. Leave them blank.

| Variable | Used on threadcount.tech for |
|---|---|
| `JACKSON_URL`, `JACKSON_API_KEY` | Single sign-on for facilities |
| `CF_ACCESS_TEAM_DOMAIN`, `CF_ACCESS_AUD` | Sign-in to ThreadCount's own staff tools |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_MONTHLY`, `STRIPE_PRICE_ANNUAL`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Card payments |
| `INVOICE_ENTITY`, `INVOICE_ABN` | Who invoices hosted plans |
| `PLANS_LIVE` | Forcing plans on. Ignored when `EDITION=community`. |
| `DEMO_DISABLED`, `DEMO_RESET_TOKEN` | The public demo facility |
| `ANDROID_APP_FINGERPRINTS_COUNTER`, `ANDROID_APP_FINGERPRINTS_STAFF` | Android App Links for ThreadCount's own Play apps |
| `LISTMONK_URL`, `LISTMONK_LIST_UUID` | The product-update mailing list |
| `CHATWOOT_URL`, `CHATWOOT_API_TOKEN`, `CHATWOOT_ACCOUNT_ID`, `CHATWOOT_INBOX_ID` | Filing contact-form messages in the helpdesk |

threadcount.tech's own settings file has four more variables, for its internal administration. The Community edition does not contain that code.
