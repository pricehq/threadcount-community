---
title: Set up in an afternoon
section: start
order: 2
summary: From creating the facility to the first garment issued at the counter, in the order the Getting set up checklist on Today asks for it.
screen: Today
role: Admin
keywords: sign up, signup, create account, new facility, setup, onboarding, checklist, getting set up, welcome, import, opening stock, opening balance, first issue
---

## Create the facility

Sign-up is three steps.

1. **You.** First name, last name, work email and a password of at least 8 characters. Password resets go to that email, so it has to be right. Where the server publishes terms or a privacy policy, `Next: your facility` stays off until you tick that you agree and can act for the facility.
2. **Your facility.** The facility name, plus two optional answers. `Setting` (Hospital, Aged care, Community health or Other) chooses a starting list of staff groups. `State or territory` sets the time zone that counts and month-end are read in, and nothing else.
3. **Confirm.** Where the server uses Cloudflare Turnstile, its security check shows above the create button.

## What is written

| Record | Change | Undo |
|---|---|---|
| Facility | Created with your name as coordinator, any seeded staff groups and the time zone | See [Delete an account](/docs/account/delete-an-account) |
| User | You, as `Admin`, with the title Uniform Coordinator | Edit under `Settings › People & sign-in` |
| Email | A welcome note to the address you typed | None |

Sign-up is refused for an email that already has an account, and after 5 sign-ups from one connection in an hour. `Open ThreadCount` then takes you to `Today`, where the checklist is titled `Welcome to ThreadCount`.

## Staff groups

Staff groups are under `Settings › Issuing rules`, on the board headed `Staff groups and how they get uniform`. It has three columns, one per route: `FTE table`, `Starting kit` and `Manager approval`. An Admin drags a group between columns, or opens its menu for `Move to …`, `Rename` and `Remove`. Type a name in `New group name` and press `Add group` to add one.

`Rename` moves every staff record filed under the group to the new name, along with garments tagged for it, and keeps its route. A group with active people filed under it cannot be removed. The rules for each route are on [Groups and routes](/docs/people/groups-and-routes).

## Load your data

`Settings › Data & audit log` has `Import from CSV`, which takes a spreadsheet saved as CSV. The `Import the register` button on `People` opens it with the staff register chosen.

1. **Choose what you are importing** from the list.
2. **Press `Download template`** and fill it in.
3. **Press `Import CSV`** and choose the file. Re-importing updates matching rows.

Import is shown to Admins only, and each user is limited to 20 imports in 10 minutes. Import the staff register and the catalogue first. The columns each template takes are on [CSV templates](/docs/reference/csv-templates). Add suppliers under `Settings › Catalogue & suppliers`, with their order email and `Lead time (days)`.

## Opening stock and the first issue

Set reorder levels on each garment's page, which opens from `Stock › On hand`. In the `Sizes` panel, the `Reorder at` column has minus and plus buttons for each size. To set one level across many garments, tick them on `On hand` and use `Set reorder`.

Then press `Adjust quantity` at the foot of `On hand` and choose `Opening balance`, which overwrites a line's opening balance and is for start-up only. Only an Admin can set an opening balance or a reorder level.

When the shelf is loaded, open `Counter`, find someone on the register and issue a garment. [Issue a garment](/docs/counter/issue-a-garment) walks through the counter.

## The setup checklist

`Today` shows a checklist, titled `Getting set up`, of six things a new facility does once.

| Step | Button |
|---|---|
| Add staff, or import the register | `Settings › Data` |
| Add garments | `Settings › Data` |
| Set reorder levels | `Stock` |
| Record opening stock | `Stock` |
| Issue a garment | `Counter` |
| Bind a barcode or print labels | `Stock` |

Each tick comes from the records, not from a click. For example, the first step is ticked once the staff register has a row in it. Every step still to do has a button to the screen that does it.

The checklist disappears once all six are ticked, or once the facility is 60 days old and three or more are ticked. An Admin can hide it sooner with `Dismiss`, and it stays hidden for the whole facility. It does not appear in the phone app.
