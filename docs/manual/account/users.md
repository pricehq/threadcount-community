---
title: Users and passwords
section: account
order: 1
summary: Add admins and issuers, change your own details and password, reset a forgotten password by email, and keep a second admin so the facility never locks.
screen: Settings › People & sign-in
role: Admin or Issuer
keywords: users, add user, edit user, admin, issuer, coordinator, login, sign in, password, change password, forgot password, reset, deactivate, reactivate, second admin, locked out, your account, profile, name
---

## Who can sign in

The people who sign in to the web app and the counter are users. Each has a work email, a password and one of two roles, Admin or Issuer. What each role may do is on [The two roles](/docs/start/the-two-roles).

Users are not the people on the register. A wearer who signs in to the staff app has a staff sign-in attached to their entry. It is managed on their record in `People`, on the `Details & access` tab, not here.

`Settings › People & sign-in` opens from the side list on `Settings`, or from your name at the foot of the menu. Everyone sees `Your account`, `Password`, `Two-factor` and `Delete my account`. Only admins see `Users`, and `Deactivated users` once there is one.

## Add or change a user

1. **Press `Add user`** beside the `Users` heading, which counts how many can sign in.
2. **Fill in first name, last name, title and work email.**
3. **Choose the role.** `Issuer` is chosen until you change it.
4. **Set a password of at least 8 characters and press `Save`.**

ThreadCount does not email the new user. The dialog says so: hand the password over yourself. One email address holds one user account across the whole service, so an address already in use is refused with `That email already has an account`.

`Edit` on a user opens the same dialog. It changes name, title and role, and `New password (leave blank to keep)` sets a new password. The work email cannot be changed. A new password ends every session signed in with the old one.

`Deactivate`, in that dialog, asks you to confirm, then stops the login without deleting it. Records keep the name, and the user moves to `Deactivated users`, where `Reactivate` lets them sign in again. The button is not offered on your own account. A deactivated user who signs in is told the account has been deactivated.

| Record | Change | Undo |
|---|---|---|
| User | Added, with a role and a password | `Deactivate` |
| User | Name, title, role or password changed | `Edit` again |
| User | Deactivated, cannot sign in | `Reactivate` |

## Your own details and password

Under `Your account`, change your first name, last name and title, then press `Save my details`. They stamp every issue, stocktake and slip you record.

Under `Password`, type `Current password`, then `New password` and `Confirm`, and press `Change password`. The new one must be at least 8 characters, and the button stays off until the two new passwords match.

You stay signed in on the device you used. Every other session signed in with the old password ends.

## Reset a forgotten password by email

On the Log in screen, type your work email, then choose `Forgot your password?`. The screen says `Reset link sent` whatever the address, so it cannot be used to find out who has an account.

- The link works once and expires in an hour.
- Asking again cancels any earlier link.
- At most 4 reset emails go to one address in an hour.
- A deactivated account is sent nothing.
- If two-factor is on, the reset asks for your code before it signs you in.

A completed reset signs you in and ends every other session on the account.

## When the email never arrives

Nothing arrives if the server has no mail set up, or if the address on the account is wrong. The Log in screen says the same thing either way, so it cannot tell you which. Self-hosting admins set mail up as described in [Email](/docs/selfhost/email).

Another admin at your facility can set you a new password with `Edit` under `Users`. The address itself cannot be changed there.

If you are the only admin, no screen can let you back in. Getting in again means work on the server itself, by whoever administers it. That is why [First run](/docs/selfhost/first-run) adds a second admin before the first sign-out.

## Why a second admin matters

ThreadCount refuses to demote or deactivate the last active admin, with `Keep at least one active admin`. It does not make you add a second one.

With one admin, that person's inbox is the only way back in when the password is forgotten, and their phone is the only way past [two-factor](/docs/account/two-factor). If the last person who can sign in deletes their account, the facility goes with it. See [Delete an account](/docs/account/delete-an-account).

> **Careful** Add a second admin with a working address before you need one. It is the one way back in that needs no email and no work on the server.
