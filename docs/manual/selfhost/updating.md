---
title: Update to a new release
section: selfhost
order: 3
summary: Back up, fetch the release, rebuild, and let the migration run before the new app starts. Why a plain git pull does not work.
role: Self-hosting admin
keywords: update, upgrade, release, new version, git pull, fetch, reset, rebuild, migrations, schema, changelog, version
---

## How releases are published

Each Community release is one commit with no history behind it. It is exported from ThreadCount's own code and the parts that belong only to threadcount.tech are removed. Before it is pushed, the result must type-check, build with `EDITION=community` and pass a smoke test. The new commit replaces the previous one on the `main` branch.

The commit message names the date it was built. The same date and the source commit are written to the `COMMUNITY_VERSION` file in the checkout, in this form:

```
community 2026-09-15 b36d739
```

A running server reports that line as `version` at `/api/app-info`.

## Back up first

Before every update, take a database dump and a copy of the photos, as in [backups](/docs/selfhost/backups):

```sh
docker/backup.sh /srv/backups/threadcount
```

Migrations only go forwards. `prisma migrate deploy` applies new migrations and has no step that undoes one, so the way back to an older release is to restore the dump you took before updating.

## Fetch the release

Because each release replaces the last commit rather than adding to it, `git pull` refuses to merge the two. Fetch, then move your checkout to the new commit:

```sh
cd /srv/threadcount
git fetch origin
git reset --hard origin/main
cat COMMUNITY_VERSION
```

`.env` is ignored by git, so `git reset --hard` leaves it alone.

> **Careful** `git reset --hard` throws away any change you made to a file in the repository, `docker-compose.yml` included. Keep local settings in `.env`, or copy your changes somewhere before you reset.

## Rebuild and start

```sh
docker compose up -d --build
```

What happens, in order:

1. **The images are rebuilt.** The build takes `NEXT_PUBLIC_SITE_URL` and `NEXT_PUBLIC_TURNSTILE_SITEKEY` from `.env` again.
2. **`db` is checked.** Compose waits until Postgres answers `pg_isready`.
3. **`migrate` runs.** It runs `npx prisma migrate deploy` against the bundled database and applies any migration the database does not have yet.
4. **`app` starts.** Compose starts the new app only if `migrate` exited successfully.

If a migration fails, `app` is not started. Read what went wrong with:

```sh
docker compose logs migrate
```

Then check the app is healthy:

```sh
docker compose ps
curl -fsS https://uniforms.example.health/api/health
```

## What changed

The Community edition has no changelog of its own. The [changelog](/changelog) on threadcount.tech lists what changed for the people who use ThreadCount, newest first. It is written for the hosted service, so entries about plans, card payments, single sign-on or the website do not apply to your server.

## Phones after an update

The Android apps ask your server at `/api/app-info` for the oldest app version it still works with, given in `minApp`. A phone running an older app is told to update rather than failing. Phones using `/m` or `/my` in a browser get the new version the next time the page loads.
