---
title: Delete an account
section: account
order: 6
summary: Delete your login or the whole facility, clear data without deleting anything else, remove a wearer's staff sign-in, and what stays behind.
screen: Settings › People & sign-in
role: Admin or Issuer
keywords: delete account, close account, delete facility, remove login, wipe, wipe activity, start fresh, empty this facility, reset, empty facility, staff app access, remove access, privacy, erase data
---

## The two cases

`Delete my account` is the last heading on `Settings › People & sign-in`. What it deletes depends on whether anyone else can still sign in.

- **Other active users remain.** Only your login goes. The facility and its records stay.
- **You are the last active user.** Your account and the whole facility go together.

The note beside the heading says which case you are in: `the facility and its records stay`, or `deletes the facility and everything in it`. The public page at [/delete-account](/delete-account) explains the same thing without signing in.

## Delete your login

1. **Press `Delete my account`.** The box asks `Delete your login?`
2. **Type your password.**
3. **Press `Delete my login`.** You are signed out and taken to the home page.

Your user row is deleted, not deactivated. Issues, stocktakes and slips you recorded keep the name they were stamped with.

If you are an admin and other users remain but no other active admin, it is refused: `You're the only admin left. Make someone else an admin first, or delete the whole facility.`

## Delete the facility

1. **Take a backup.** `Download a backup first` sits above the button. See [Export and backup](/docs/account/export-and-backup).
2. **Press `Delete my account and this facility`.**
3. **Type your password, and type the facility name exactly.**
4. **Press `Delete everything`.**

Every user, the catalogue and barcodes, the register, and every issue, return, order, delivery, stocktake, request, photo and signature are deleted at once. It cannot be undone. This needs an admin account.

| Record | Change | Undo |
|---|---|---|
| Your user | Deleted | None |
| Facility | Deleted with everything in it | None; a backup file can be restored into a new facility |

Deleting works in a read-only facility. In the demo the button is switched off.

> **Careful** Deleting the facility does not stop a card plan. Press `Stop at period end` on `Settings › Plan` first.

## Clear data, keep the account

Two boxes on `Settings › Data & audit log`, above the audit log, remove data and leave everyone signed in. Only admins see them.

| | Wipe recorded activity | Start fresh |
|---|---|---|
| Confirm | Type `WIPE`, press `Wipe activity` | Type `RESET`, press `Empty this facility`, then confirm |
| Deletes | Issues, orders, pickups, stocktakes, stock moves, approvals, alterations, hand-ins, staff-app requests and messages, waitlist, kit checks, damage reports, record queries, the ward notice, photos | Everything in Wipe, plus the catalogue, barcodes, stock levels, departments, suppliers, locations, the register and its staff sign-ins |
| Keeps | Catalogue, register, departments, suppliers, barcodes, locations, opening balances, users | Users, facility name and settings |
| Also | Stock adjustments and pre-loved counts set to 0; order and request numbers restart | Order, catalogue and request numbers restart |

Both happen at once and cannot be undone.

## Staff sign-ins

A wearer cannot delete their staff sign-in from the staff app. An admin opens their record in `People`, goes to the `Details & access` tab, and in the `Staff app` panel presses `Remove access`, then confirms. The sign-in is deleted and they are signed out. A new code lets them back in later.

Their register entry and issue history stay, because they are the facility's stock records. Removing those is covered in [Deactivating and deleting](/docs/people/deactivating-and-deleting). A wearer who would rather not ask their coordinator can write to privacy@threadcount.tech.

## What is kept

- **Your name on records,** when only your login was deleted.
- **Backup files you downloaded.** They are on your own device. Delete them yourself.
- **Nothing in the facility,** once the facility is deleted. Its rows and its photo files go together.

The [privacy policy](/privacy) describes the hosted service's own encrypted backups.
