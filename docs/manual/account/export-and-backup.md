---
title: Export and backup
section: account
order: 5
summary: The one-file backup, CSV exports, the last-backup date, what a restore replaces and refuses, and whose backups are whose.
screen: Settings › Data & audit log
role: Admin
keywords: backup, export, export backup, download, restore, import backup, JSON, CSV, export CSV, last backup, data, audit log, recovery, take my data, leave
---

## The backup file

`Export backup` on `Settings › Data & audit log` downloads the whole facility as one JSON file, named for the date where your facility is, such as `threadcount-backup-2026-09-13.json`. Only admins can take it.

The file holds the facility's settings and every record. That covers the catalogue, barcodes, stock and its movements, and locations. It also covers departments, suppliers, the register, manager approvals, issues, orders and their deliveries, pickups, stocktakes, hand-ins and cost changes. The staff app's side is in it too: requests and their messages, the waitlist, kit checks, damage reports, record queries and the ward notice. Photos and signatures are written into the file.

Users and staff sign-ins are left out on purpose, because those rows hold passwords.

The newest photos travel, up to 2000 photos or 40 MB. Older ones are counted and left out, so the file stays small enough to restore. After `Export backup`, the line under the buttons says how many were left out. The records they belong to are all in the file, and the images stay on the server.

## CSV exports

`Export CSV` appears on `People`, `Requests`, the `On hand` and `Locations` tabs of `Stock`, the order ledger at `Orders › All orders`, and `Reports`. On the `Count` tab, each past stocktake in the history has its own `CSV` button. An order's own page has `CSV` under `More` at the top. In Settings it is on the supplier list, the departments and cost centres list, and the audit log. The files are for reading and for finance; see [Reports](/docs/reports/the-nine-reports).

Only the backup file restores a facility. A CSV export does not change the last-backup date.

## The last-backup date

The `Backup` heading on `Settings › Data & audit log` shows `Last backup` with the date and how many days ago, or `No backup taken yet.` Issuers see this line too. Past 7 days, or with no backup at all, it is marked in red, and admins see `!` beside `Settings` in the menu.

Each download of the backup file, from either screen, sets the date.

## Restore a backup

1. **Open `Settings › Data & audit log` and choose `Import backup`.**
2. **Pick a ThreadCount backup file.**
3. **Confirm.** The warning says the restore replaces all data in this facility, and that users are kept.

Everything in the facility is deleted and rebuilt from the file, facility settings included. The facility name, slips, groups, sets and time zone all come from the file. It keeps the users. Staff sign-ins survive, re-attached to register entries by staff number.

| Record | Change | Undo |
|---|---|---|
| Facility | All records replaced by the file's | Restore an earlier file |
| Facility | Settings replaced by the file's | Restore an earlier file |
| Staff sign-ins | Re-attached by staff number | None needed |

A restore is refused when:

- the file is not a ThreadCount backup;
- the file exceeds a count limit, such as 20,000 staff or 300,000 issues;
- you have made 20 restores or imports in 10 minutes;
- the upload is over 60 MB.

Photos beyond 2000 in a file are dropped rather than refused, and the line under the buttons says how many. Keep that file, because those images exist only in it.

> **Careful** A restore replaces what is there now. Take a fresh backup first if today's records matter.

## Keeping the file

Nobody else holds a copy of your facility. The server is the facility's own, so the backups that exist are the ones the facility takes: this file, and the server backups described in [Backups](/docs/selfhost/backups).

No screen restores a facility from a server backup. The only restore in the app is `Import backup` with a file you hold.

Store the file under your records policy; it holds the register. Exporting regularly, and keeping what you export somewhere other than the server, is the facility's own responsibility.
