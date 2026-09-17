---
title: First run
section: selfhost
order: 2
summary: The first sign-up creates the facility and its admin; then groups, data, a second admin, closing sign-ups, and pointing the phone apps at your server.
screen: Settings
role: Self-hosting admin
keywords: first run, sign up, create account, facility, admin, staff groups, routes, import, csv, checklist, today, second admin, signups disabled, phone apps, server
---

## Create the facility

There is no default username or password. Whoever creates an account first creates a facility and becomes its admin.

1. **Open your address.** `/` sends you to the sign-in page at `/auth`.
2. **Choose to create the facility's account.** Sign-up is three steps.
3. **Step 1, You.** Your first and last name, your work email and a password of at least 8 characters. The email is where a password reset goes, so it has to be right. If you have set `NEXT_PUBLIC_TERMS_URL` or `NEXT_PUBLIC_PRIVACY_URL`, you also tick that you agree to them.
4. **Step 2, Your facility.** The facility name, plus two optional answers. The setting (hospital, aged care or community) chooses a starting list of staff groups. The state sets the time zone that counts and month-end use.
5. **Step 3, Confirm.** You are signed in as the facility's admin. Open ThreadCount on the next screen takes you to `Today`, where the Welcome to ThreadCount checklist lists six first steps, each with a button while it is not done.

| Record | Change | Undo |
|---|---|---|
| Facility | Created with your facility name | Delete the account under `Settings › People & sign-in` |
| User | You, role Admin, title Uniform Coordinator | Edit under `Settings › People & sign-in` |

The address you typed is not verified. If mail is set up, a welcome note goes to it. If it is not, the screen says so and asks you to make sure the address is right.

## Staff groups first

Open `Settings › Issuing rules` and find Staff groups and how they get uniform. It is a board with one column per route: FTE table, Starting kit and Manager approval. If you chose a setting at sign-up, a starting list is there; drag a group to another column, or use its menu to rename or remove it. Otherwise the board says "No staff groups yet — everyone is on manager approval." Add a group with New group name and Add group.

Each group takes one route to its kit. The routes are explained in [groups and routes](/docs/people/groups-and-routes).

## Load your data

`Settings › Data & audit log` has Import from CSV. Choose the kind of file (Catalogue, Staff register, Departments & cost centres, Supplier barcodes, Reorder levels or Opening balances), use Download template for its columns, then Import CSV. Re-importing updates matching rows. The columns are in [CSV templates](/docs/reference/csv-templates).

For admins, Import the register on `People` opens this screen with Staff register already chosen. The first two checklist steps on `Today` open this screen too.

## Add a second admin

Do this before you sign out.

1. **Open `Settings › People & sign-in`.** Users comes after Two-factor, and only admins see it.
2. **Choose Add user.** Enter the first and last name, an optional title, the role (Admin or Issuer), the work email and a password of at least 8 characters.
3. **Hand the password over yourself.** The screen says so: passwords set here are not emailed.

An admin can later set a new password for another user with Edit on the same list, in New password (leave blank to keep). That is the way back in when mail is not configured: the forgot-password form sends nothing without mail, so a facility whose one admin forgets their password has nobody who can reset it. See [users](/docs/account/users).

## Close sign-ups

Once your facility exists, stop anyone else creating one on your server:

```sh
# in .env
SIGNUPS_DISABLED=1
```

```sh
docker compose up -d
```

With `SIGNUPS_DISABLED=1` the sign-in page no longer offers to create a facility, and the sign-up endpoint answers `403` with "New facility sign-ups are closed." Nothing in the product can reopen sign-ups while the variable is set.

> **Careful** While sign-ups are open, any visitor to your address can create their own facility on your database.

## The phone apps

Your server answers the Android apps as well as a browser. Each phone is told which server to use: on the app's first screen, tap the `Server` line and enter your hostname. The app checks it over https and uses it from then on. See [the counter app](/docs/apps/counter-app).

Without the apps, the same screens work in a phone's browser: `/m` for the counter and `/my` for staff.

Error reports and usage statistics are sent nowhere unless you point them at a collector of your own, and Cloudflare Turnstile is optional rather than required. Both are in the [configuration reference](/docs/selfhost/configuration-reference).
