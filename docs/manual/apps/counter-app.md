---
title: The counter app
section: apps
order: 1
summary: The uniform store's phone app, on Android and in a phone browser. Choosing a server, signing in, the screens, and what it keeps on the phone.
screen: /m
role: Admin or Issuer
keywords: counter app, android, phone, mobile, play store, install, sign in, server, self-hosted, community, offline, camera, stocktake, count, issue
---

The counter app is the coordinator's side of ThreadCount on a phone. You sign in with the same Admin or Issuer account as the portal at `/app` and see the same records, served at `/m`.

## Two ways to open it

- **In a phone browser.** Go to `/m` on your facility's server, such as `https://uniforms.example.com/m`. You don't need to install anything.
- **The Android app.** It is called **ThreadCount** on Google Play. It shows the same `/m` screens inside the app and adds the phone's own barcode scanner (see [Scanning and browsers](/docs/apps/scanning-and-browsers)).

There is no iOS app. On an iPhone or iPad, open `/m` in the browser.

## The first screen and choosing a server

Every organisation runs its own server, so the app has to be told which one before it can do anything. That is done once, on each phone, and the app has no default.

The first time you open the Android app, the welcome screen shows **Sign in**, **Sign up** and a line reading `Server: not chosen yet · Choose`. Tapping `Sign in` or `Sign up` before a server is chosen opens the same `Which server?` screen first.

1. **Tap the `Server` line.** The `Which server?` screen opens with `Your organisation's server` chosen.
2. **Type your organisation's server address,** for example `uniforms.example.com`.
3. **Tap `Check and use this server`.** The app checks the server's `/api/app-info` to confirm it is a ThreadCount server, then carries on to sign-in if that is where you were headed.

The app refuses an address that doesn't answer over https within 8 seconds, or that answers but isn't a ThreadCount server. Once the check passes, the app saves the address on that phone and opens that server from then on. The same screen changes it later, and the sign-in screens show which server they are talking to.

`Just looking: the demo` points the phone at the shared demo instead. It is for looking around only: everyone shares it, and it wipes itself every twenty minutes.

Once you have tapped `Sign in` or `Sign up` on that phone, the app skips the welcome screen and goes straight to `/m`.

## Signing in and signing up

`Sign in` asks for your work email and password. If your account has two-factor turned on, it then asks for the six-digit code from your authenticator app. A recovery code also works. `Forgot password` emails a reset link that works once and expires after an hour. See [Two-factor](/docs/account/two-factor).

`Sign up` creates a new facility. It doesn't add you to an existing one. The person who signs up becomes the new facility's first Admin. To add someone to an existing facility, an Admin adds them with `Add user` in `Settings › People & sign-in` in the portal: see [Users](/docs/account/users).

## The screens

The bar at the bottom has five tabs.

| Tab | What it does |
|---|---|
| Today | What is waiting (requests to pick, a shelf due a count, deliveries, late pickups, sizes below par), your day's figures and recent activity. The gear opens `Settings`. |
| Work | `Picks`, `In`, `Pickups` and `Rounds`, each with its count |
| Scan | The camera. It reads a staff badge, a garment or a shelf label, or you type a code |
| Stock | `Below par`, `On order` and `All`, with a search box |
| People | Search the register; people served recently first |

What `Scan` does with a code:

- **A staff number** opens that person's record.
- **A garment's barcode** opens that size's stock line.
- **A shelf label** (a `TCL-` code) starts a count of that shelf.
- **A code nobody has** says so; an Admin can bind it to a size from the catalogue.

### A person's record

The record has three segments. [Issue a garment](/docs/counter/issue-a-garment) and [Exchanges and returns](/docs/counter/exchanges-and-returns) say what each writes.

- **Issue.** Their sizes as cards, a meter each for tops and pants against the ceiling, and the lines being issued. `Review and sign` opens the signature.
- **Hand back.** Scan or tap what they hand back, pick its condition, and swap a size in the same record.
- **History.** Issues and hand-backs by day, and their staff app sign-in. An Admin generates a staff app code here.

### Where the other screens are

| Screen | Where |
|---|---|
| Receive a delivery | `Work › In` |
| Pickup call list | `Work › Pickups` |
| Delivery round, with a signature | `Work › Rounds` |
| Pick and hand over a staff request | `Work › Picks` |
| Count a shelf | Scan its label, `Today`, or `Stock › Count a shelf` |
| Reprint a label | A stock line's `Print a label` |
| Draft order | `Stock › Draft order`, or a stock line's `Add to the draft order` |
| Variance over time | `Stock › Variance over time` |
| Catalogue, product card and new garment | `Stock › Catalogue`; an Admin edits there |

`Settings` holds only what the phone controls:

- `Beep and buzz on scan`, which applies to this device only
- `Shelf printer`: `Ready`, `Update the app` or `Browser`
- `Server`, the address the phone is using
- `Count gap needing a reason`. An Admin can change it; an Issuer can only see it.
- `Help`, then `Delete your account`, `Privacy policy` and `Terms of use`
- `Sign out`

`Orders`, `Reports` and the facility's settings are in the portal at `/app`. On a phone, the portal's `More` sheet has a `Counter app` link that opens `/m`.

## Printing from the phone

A stock line's `Print a label` and the `Label` button on `Count a shelf` print through Android's print dialog, which lists every print service installed on the phone: the printer maker's Bluetooth service, a network printer, or `Save as PDF`. Printing needs version 1.5 of the Android app or later; an older version shows `Update the app`. In a phone browser the label opens in a new tab to print.

## What it keeps on the phone

The app keeps only these on the phone:

- your session
- any shelf count you have started but not filed. It is kept under your own account, so the next person on a shared phone never sees it. Filing the count deletes it, and signing out deletes all your open counts.
- the lines you are issuing or taking back but haven't recorded. Signing out deletes them.
- the beep setting, the chosen server, and whether the welcome screen has been seen

Issues, returns, stock, the staff register and every other record stay on the server.

## Permissions and connection

The Android app asks for one permission, the camera, and uses it only to read barcodes. No picture from scanning is stored or sent.

The app works online only. With no connection it shows `No connection.` and a `Try again` button, and it won't let you issue or count anything. Nothing is queued to send later. A count you hadn't filed stays on the phone until you're back online.

> **Careful** Signing out deletes any shelf count you haven't filed. File it first, or you'll have to count that shelf again.
