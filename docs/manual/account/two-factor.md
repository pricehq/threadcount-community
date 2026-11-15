---
title: Two-factor sign-in
section: account
order: 2
summary: Turn on codes from an authenticator app, keep the recovery codes, sign in with them, and recover from a lost phone.
screen: Settings › People & sign-in
role: Admin or Issuer
keywords: two-factor, two-factor authentication, 2FA, MFA, authenticator, TOTP, code, six digits, recovery codes, lost phone, new phone, trust this computer, security
---

## What it does

With two-factor on, a correct password is not enough to sign in. The Log in screen also asks for the six-digit code from an authenticator app on your phone.

It is set for your own account, under the `Two-factor` heading on `Settings › People & sign-in`. Nobody else can turn it on or off for you, and it is optional for every role. An admin with two-factor off sees a note there saying it is worth turning on.

## Turn it on

1. **Open `Settings › People & sign-in` and press `Set up two-factor`.** A QR code appears, with the key written out under `Or type it in`.
2. **Scan the QR code with any authenticator app,** or type the key into it.
3. **Type the code the app shows into `Code from the app` and press `Turn it on`.** Nothing changes until this code is accepted. `Cancel` leaves your sign-in as it was.
4. **Save the recovery codes.** Ten appear, each in the form `XXXXX-XXXXX`. `Copy all` puts them on the clipboard. Press `I have saved them` when they are safe.

The `Two-factor authentication` box then shows `On` and how many recovery codes are left.

| Record | Change | Undo |
|---|---|---|
| Your user | Two-factor on, 10 recovery codes made | `Turn off` |
| Your user | 10 new recovery codes, the old ones dead | None |
| Your user | Two-factor off, recovery codes deleted | Set it up again |

Each of these is also written to the audit log on `Settings › Data & audit log`, which admins can read.

## Recovery codes

Recovery codes are stored hashed. They are shown once, when they are made, and nobody can read them back afterwards, ThreadCount included. Print them or keep them somewhere you can reach without your phone.

Each code works once, in place of a code from the app. When 2 or fewer are left, the box suggests a fresh set.

`New recovery codes` asks you to confirm with your password, then `Generate new codes` shows 10 new codes. Every earlier code stops working at that moment.

## Signing in

After a correct password the Log in screen asks for the code. `Use a recovery code instead` switches the box to take a recovery code.

- Tick `Trust this computer for 30 days` and that browser is not asked for a code for 30 days. Changing your password ends the trust.
- The code step accepts 10 attempts per account in 15 minutes, then answers `Too many attempts — try again in a few minutes.`
- If the step has expired, the screen says `That sign-in has expired. Start again.` Type your password again.

A password reset by email also asks for the code before it signs you in, so a reset is not a way around two-factor.

## A lost or replaced phone

1. **Sign in with a recovery code.**
2. **Open `Settings › People & sign-in`, press `Turn off`, type your password and press `Turn it off`.**
3. **Press `Set up two-factor`** and scan the new QR code with the new phone. A new set of recovery codes comes with it.

If the old phone still works, do the same steps with a code from it instead of a recovery code.

There is no screen where an admin turns off two-factor for another user. The `Edit user` dialog has no two-factor control.

> **Careful** A user with no phone and no recovery codes cannot sign in from any screen. For an only admin, that means nobody can. Keep the codes, and keep a second admin.
