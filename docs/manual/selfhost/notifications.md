---
title: Notifications to the staff app
section: selfhost
order: 7
summary: Setting up notifications to the ThreadCount Staff app on Android, from creating the Firebase project to the one environment variable the server reads — and what is deliberately never in one.
role: Self-hosting admin
keywords: notifications, push, firebase, fcm, android, staff app, google-services.json, service account, TC_FCM_KEY_FILE, messaging
---

## What this gets you

With notifications set up, the ThreadCount Staff app tells somebody on their phone when their
request is approved or declined, when a bag is ready to collect, when it goes out on the delivery round,
when a kit check opens, and — for whoever a request is addressed to — that something is waiting on
them. Each person chooses which of those they want, on their own Account screen.

None of it is required. With nothing set up, ThreadCount works exactly as it does today: the emails
still go out (see [email](/docs/selfhost/email)), the screens still show everything, and the Account
screen says plainly that notifications aren't set up on this server rather than offering a switch
that does nothing.

Notifications go to the Android app, not to a browser. A wearer who wants them installs the app.

## What is never in a notification

A notification body is drawn on a phone's lock screen, where anyone walking past a team desk can
read it. So the text carries the request's reference and the garment names, and nothing else:

- never the **collection code** — that is what a bag is handed over against;
- never a **count** of anything;
- never a cost, a charge or any other money.

"Ready to collect · R-0042 · Navy tunic" is the whole of it. The code stays behind the sign-in, on
the order and on the full-screen card the person shows at the counter.

## Setting it up

You need a Google account and about fifteen minutes. Everything below is free at the volumes a
uniform store sends.

1. **Create a Firebase project** at the Firebase console. Any name; it holds nothing but the
   messaging configuration.
2. **Add an Android app** to that project with the package name `tech.threadcount.staff`.
3. **Download `google-services.json`** and put it at `android-staff/app/google-services.json` in
   your checkout *before* you build the app. The Android build only includes notification support
   when that file is there, so a bundle built without one is a normal app that simply never
   receives anything.
4. **Create a service account** in the project (Project settings ▸ Service accounts), give it the
   Firebase Messaging role, and download its JSON key.
5. **Put the key somewhere the server can read and nothing else can** — outside the checkout, owned
   by the user the application runs as, `chmod 600`. It is a credential: anyone holding it can send
   notifications to your staff.
6. **Set `TC_FCM_KEY_FILE`** to that file's full path and restart the application. The project id is
   read out of the key file, so there is nothing else to configure.
7. **Build and distribute the app** with the config file in place. Each person then turns
   notifications on in the app, on the Account screen, and Android asks their permission at that
   moment — never at launch. A phone still running a copy of the app from before notifications
   existed says so on that screen and registers nothing until it is updated.

## Checking it works

Open the staff app, go to Account and turn a switch on. If the switches are greyed out with
"Notifications aren't set up on this server", the server has no key: check that `TC_FCM_KEY_FILE`
points at a file the application can read, and that the application was restarted after you set it.

With no phone registered anywhere, every send does nothing at all. That is the correct behaviour,
not a fault: the application never fails an approval, a pick or a kit check because a notification
could not be sent.

## Turning it off again

Unset `TC_FCM_KEY_FILE` and restart. Nothing is sent, the app says so, and every preference people
chose is kept for whenever you turn it back on. Registered phones fall away on their own: a new
password clears that person's devices, removing their access removes them with it, and a phone that
is wiped or has the app removed is dropped the first time Google says the registration is gone.

The variable is listed with every other setting in the
[configuration reference](/docs/selfhost/configuration-reference), and what a wearer sees is
described in [the staff app](/docs/apps/staff-app).
