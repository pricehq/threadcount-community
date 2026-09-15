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

`Export backup` on `Settings › Data & audit log` downloads the whole facility as one JSON file, named for the date where your facility is, such as `threadcount-backup-2026-09-13.json`. `Download backup` on `Settings › Plan` gets the same file. Only admins can take it.

The file holds the facility's settings and every record. That covers the catalogue, barcodes, stock and its movements, and locations. It also covers departments, suppliers, the register, manager approvals, issues, orders and their deliveries, pickups, stocktakes, hand-ins and cost changes. The staff app's side is in it too: requests and their messages, the waitlist, kit checks, damage reports, record queries and the ward notice. Photos and signatures are written into the file.

Left out on purpose:

- users and staff sign-ins, because those rows hold passwords;
- ThreadCount's own notes about your plan.

The newest photos travel, up to 2000 photos or 40 MB. Older ones are counted and left out, so the file stays small enough to restore. After `Export backup`, the line under the buttons says how many were left out. The records they belong to are all in the file, and the images stay on the server.

The backup still downloads when the facility is read-only.

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

Everything in the facility is deleted and rebuilt from the file, facility settings included. The facility name, slips, groups, sets and time zone all come from the file. It keeps the users, single sign-on settings and plan. Staff sign-ins survive, re-attached to register entries by staff number.

| Record | Change | Undo |
|---|---|---|
| Facility | All records replaced by the file's | Restore an earlier file |
| Facility | Settings replaced by the file's | Restore an earlier file |
| Staff sign-ins | Re-attached by staff number | None needed |

A restore is refused when:

- the file is not a ThreadCount backup;
- the facility is read-only;
- the file holds more staff records than the plan allows, 60 on Hosted Small;
- the file exceeds a count limit, such as 20,000 staff or 300,000 issues;
- you have made 20 restores or imports in 10 minutes;
- the upload is over 60 MB.

Photos beyond 2000 in a file are dropped rather than refused, and the line under the buttons says how many. Keep that file, because those images exist only in it.

> **Careful** A restore replaces what is there now. Take a fresh backup first if today's records matter.

## Your backups and the service's

The `Backups` row on `Settings › Plan` shows the hosted service's own nightly backups: 14 days on Hosted Small, 35 days on the other plans. What they commit to is in the [Service Level Agreement](/sla) and on [Security](/security).

No screen restores one facility from those backups. The only restore in the app is `Import backup` with a file you hold.

The [Terms](/terms) make exporting and keeping regular backups the facility's own responsibility. Store the file under your records policy; it holds the register. Self-hosted servers need a backup of their own, as described in [Backups](/docs/selfhost/backups).
