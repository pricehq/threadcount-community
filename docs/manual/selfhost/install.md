---
title: Install the Community edition
section: selfhost
order: 1
summary: What the server needs, the four settings that must be set, starting it with Docker Compose, the HTTPS proxy in front, and how to tell it is up.
role: Self-hosting admin
keywords: install, self-host, docker, compose, community edition, server, port, proxy, caddy, https, health check, requirements
---

## What you need

The Community edition runs as three containers from one `docker-compose.yml`. Before you start you need:

- A Linux server with Docker and Docker Compose. The README suggests 2 CPU and 2 GB of memory to start.
- A hostname pointing at that server, for example `uniforms.example.health`.
- An HTTPS reverse proxy in front of it (Caddy, nginx or Traefik).

HTTPS is not optional. The app runs with `NODE_ENV=production`, and in production the session cookie is marked `Secure`. A browser on another machine will not send that cookie over plain HTTP, so nobody can sign in.

The three services are:

| Service | Image | What it does |
|---|---|---|
| `db` | `postgres:16-alpine` | The database, in the named volume `db` |
| `migrate` | built locally | Runs `npx prisma migrate deploy` once, then exits |
| `app` | built locally | The product, on port 3000, photos in the named volume `photos` |

## Clone and set the four settings

```sh
git clone https://github.com/pricehq/threadcount-community.git
cd threadcount-community
git checkout "$(git tag --sort=-v:refname | head -1)"
cp .env.example .env
```

The `git checkout` line moves you to the newest release. See [updating](/docs/selfhost/updating) for how releases are named.

Open `.env` and set these four. The rest can stay blank.

| Setting | What to put |
|---|---|
| `SESSION_SECRET` | A long random string: `openssl rand -base64 48`. The server refuses to start while it still says `change-me`. |
| `POSTGRES_PASSWORD` | Any long password. Compose refuses to start without it. |
| `NEXT_PUBLIC_SITE_URL` | The address people will type: `https://uniforms.example.health`. |
| `EDITION` | `community` |

`NEXT_PUBLIC_SITE_URL` is compiled into the app when the image is built, and it is the base of every link in an email (password resets, approval links). If it is blank the build uses `http://localhost:3000`. If you change it later you must rebuild.

> **Careful** The image build does not read `.env`: only `NEXT_PUBLIC_SITE_URL` and `NEXT_PUBLIC_TURNSTILE_SITEKEY` are passed in as build arguments. Other `NEXT_PUBLIC_` values in `.env` do not reach a Docker install. See [the configuration reference](/docs/selfhost/configuration-reference).

## Build and start

```sh
docker compose up -d --build
```

The first start builds the image, which takes a few minutes. Compose then starts `db` and waits for `pg_isready`, runs `migrate` to create the schema, and starts `app` only once `migrate` has finished without an error.

Watch progress with:

```sh
docker compose ps
docker compose logs -f app
```

If the app stops at once with `Refusing to start:`, the message names the setting that is missing or unsafe. In the Community edition it checks two: `DATABASE_URL` and `SESSION_SECRET`. `DATABASE_URL` is filled in by `docker-compose.yml`, so you do not set it.

## The port and the proxy

Inside the container the app always listens on 3000. On the server it is published on `APP_PORT`, which defaults to `3000`. Change `APP_PORT` in `.env` if 3000 is taken.

Point your proxy at that port. A Caddyfile for Caddy is:

```
uniforms.example.health {
    reverse_proxy 127.0.0.1:3000
}
```

Docker publishes the port on every interface of the server, not only `127.0.0.1`. Firewall it, or set `APP_PORT=127.0.0.1:3000` so only a proxy on the same machine can reach it.

The sign-in, sign-up and reset limits count per address. The app reads the address from the last entry of the `X-Forwarded-For` header, then from `X-Real-IP`. Caddy sets `X-Forwarded-For` for you. If neither header arrives, every visitor counts as the same address, and one person's failed attempts count against everyone.

## Check it is up

The app answers `/api/health` without signing in. It asks the database a question and replies:

| Answer | Meaning |
|---|---|
| `200` with `{"ok":true}` | The app is serving and the database answers |
| `503` with `{"ok":false}` | The app is running but cannot reach the database |

```sh
curl -fsS https://uniforms.example.health/api/health
```

The image runs the same check itself every 30 seconds, so `docker compose ps` shows `app` as `healthy` once it passes.

`/api/app-info` is also public. It returns `"product": "threadcount"`, `"edition": "community"` and the release in `version`, which is read from the `COMMUNITY_VERSION` file. The Android apps call it before they will point at your server.

## Next

Open `https://uniforms.example.health`. The address `/` sends you to `/auth`. Go on to [first run](/docs/selfhost/first-run) to create the facility, then set up [email](/docs/selfhost/email) and [backups](/docs/selfhost/backups) before anyone relies on it.
