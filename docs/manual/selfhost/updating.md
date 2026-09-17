---
title: Update to a new release
section: selfhost
order: 3
summary: Back up, fetch the release, rebuild, and let the migration run before the new app starts. Why a plain git pull does not work.
role: Self-hosting admin
keywords: update, upgrade, release, new version, git pull, fetch, reset, rebuild, migrations, schema, changelog, version
---

## How releases are published

Releases go out about once a week. Each one is a tag named after the date it was cut, such as `v2026.09.17`, with `.2` added for a second release that day. Every release is listed with its notes on the repository's Releases page, and the same notes are in `CHANGELOG.md`. To hear about new ones on GitHub, choose Watch, then Custom, then Releases.

A release is one commit with no history behind it. It must type-check, build with `EDITION=community` and pass a smoke test before it is tagged. `main` points at the newest build. Every tag stays downloadable after `main` moves on, which is what makes going back possible.

The tag and the source commit are written to the `COMMUNITY_VERSION` file in the checkout:

```
community v2026.09.17 b36d739
```

A running server reports that line as `version` at `/api/app-info`.

## Back up first

Before every update, take a database dump and a copy of the photos, as in [backups](/docs/selfhost/backups):

```sh
docker/backup.sh /srv/backups/threadcount
```

Migrations only go forwards. `prisma migrate deploy` applies new migrations and has no step that undoes one, so the way back to an older release is to restore the dump you took before updating.

## Fetch the release

Because each release replaces the last commit rather than adding to it, `git pull` refuses to merge the two. Fetch the tags, then move your checkout to the newest release:

```sh
cd /srv/threadcount
git fetch --tags --force origin
git reset --hard "$(git tag --sort=-v:refname | head -1)"
cat COMMUNITY_VERSION
```

To move to a particular release instead, name its tag: `git reset --hard v2026.09.17`.

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

## Go back to an older release

Migrations only go forwards, so going back needs the database dump you took before updating.

1. **Stop the app.** Run `docker compose down`.
2. **Restore the dump.** Follow [backups](/docs/selfhost/backups).
3. **Move to the older tag.** Run `git reset --hard v2026.09.17`, naming the release you were on.
4. **Rebuild.** Run `docker compose up -d --build`.

## What changed

Each release's notes are on the repository's Releases page and in `CHANGELOG.md` in your checkout, newest first.

## Phones after an update

The Android apps ask your server at `/api/app-info` for the oldest app version it still works with, given in `minApp`. A phone running an older app is told to update rather than failing. Phones using `/m` or `/my` in a browser get the new version the next time the page loads.
