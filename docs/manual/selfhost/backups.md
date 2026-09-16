---
title: Backups and restore
section: selfhost
order: 4
summary: Nightly database dumps and photo copies from the compose file's own services and volumes, the in-app export as a second copy, and how to restore and test a restore.
role: Self-hosting admin
keywords: backup, restore, pg_dump, pg_restore, database, photos, signatures, volume, cron, export, import, disaster recovery, test restore
---

## What has to be kept

A Community instance keeps its data in two Docker volumes. Back up both, together.

| Volume | Mounted at | Holds |
|---|---|---|
| `threadcount_db` | `/var/lib/postgresql/data` in `db` | Every record: catalogue, stock, staff, issues, orders, requests, users |
| `threadcount_photos` | `/data/photos` in `app` | Signatures and damage photographs |

The names come from `docker-compose.yml`: the project is named `threadcount`, and its volumes are `db` and `photos`.

Photos are not in the database. Each one is a file at `<facility id>/<photo id>.jpg` (or `.png`) under `/data/photos`, and the database holds only that path. A database dump without the photos restores every record but none of the signatures or photographs.

## Nightly dumps

The checkout includes `docker/backup.sh`. Run it from the checkout and give it a destination directory:

```sh
cd /srv/threadcount
docker/backup.sh /srv/backups/threadcount
```

Each run writes a dated directory, for example `2026-09-15-033001`, containing:

- `threadcount.dump`: the database as a custom-format `pg_dump`, taken inside `db` as the `threadcount` user
- `photos.tgz`: the photos directory copied out of `app`

It keeps the newest 14 directories and deletes older ones. Run it nightly from cron:

```
30 3 * * * cd /srv/threadcount && docker/backup.sh /srv/backups/threadcount >> /var/log/threadcount-backup.log 2>&1
```

> **Careful** A backup on the same disk as the volumes is lost with them. Copy the backup directory to another machine.

## The export as a second copy

An admin can download the whole facility as one JSON file from `Settings › Data & audit log` with Export backup. It needs no access to the server's command line, and it can be imported on another server.

| Part | In the export |
|---|---|
| All facility records | Yes |
| Photos | The newest ones only: at most 2000 photos and 40 MB of image data. The screen says how many older photos were left out. |
| Users (admins and issuers) | No |
| Staff app logins | No. A restore keeps the existing logins and re-attaches them by staff number. |

Import backup on the same screen asks you to confirm, then replaces all of that facility's data with the file's. Users are kept. See [export and backup](/docs/account/export-and-backup).

Because it leaves out older photos and users, the export is a second copy, not a replacement for the dump.

The Backup line on that screen shows the date of the last export. For admins, `Settings` in the menu shows `!` when that export is more than 7 days old or has never been taken. A run of `docker/backup.sh` does not change that date.

## Restore from a dump

This replaces everything on the server with the backup. Choose the backup directory first; these steps use `2026-09-15-033001`.

1. **Extract the photos.**

```sh
cd /srv/backups/threadcount/2026-09-15-033001
tar -xzf photos.tgz
```

2. **Stop the stack and remove both volumes.**

```sh
cd /srv/threadcount
docker compose down
docker volume rm threadcount_db threadcount_photos
```

3. **Start only the database, then load the dump.**

```sh
docker compose up -d db
docker compose exec -T db pg_restore -U threadcount -d threadcount --clean --if-exists < /srv/backups/threadcount/2026-09-15-033001/threadcount.dump
```

4. **Start everything.** `migrate` runs first and finds nothing to apply that the dump does not already have.

```sh
docker compose up -d
```

5. **Put the photos back and give them to the app's user.**

```sh
docker compose cp /srv/backups/threadcount/2026-09-15-033001/photos app:/data/
docker compose exec -u root app chown -R threadcount:threadcount /data/photos
```

Restore onto the release the dump was taken from, or a later one. Migrations only go forwards.

> **Careful** `docker volume rm` deletes the live data. Take a fresh backup first if the current data might still be needed.

## Test a restore

A backup that has never been restored is not proven. Restore into a second, separate stack on the same server, under another project name and port, so the live instance is untouched:

```sh
cd /srv/threadcount
APP_PORT=3100 docker compose -p tcrestore up -d db
docker compose -p tcrestore exec -T db pg_restore -U threadcount -d threadcount --clean --if-exists < /srv/backups/threadcount/2026-09-15-033001/threadcount.dump
APP_PORT=3100 docker compose -p tcrestore up -d --build
curl -fsS http://127.0.0.1:3100/api/health
```

Then check what came back:

- **Sign in.** Forward the port with `ssh -L 3100:127.0.0.1:3100` and open `http://localhost:3100` on your own machine.
- **Compare the counts.** The line at the top of `Settings › Data & audit log` gives active staff, garments, issues and orders. Check it against the live instance.

When you are done, remove the test stack and its volumes:

```sh
docker compose -p tcrestore down -v
```
