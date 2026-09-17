---
title: The staff app
section: apps
order: 2
summary: The app for people who wear the uniform. How a staff member gets a sign-in, what they see and can do, what managers get, and how access is removed.
screen: /my
role: Staff
keywords: staff app, details and access, wearer, nurse, self-service, code, slip, activation, sign in, kit, request, waitlist, damage, kit check, manager, approve, ward round, remove access
---

The staff app shows one staff member their own uniform record, and lets them ask the linen room for what they need. It is at `/my` in any browser, and on Google Play as **ThreadCount Staff**, which opens the same screens. There is no iOS app.

A staff sign-in is not a coordinator account: it is attached to the person's register entry, and cannot open `/app` or `/m`.

## Getting a sign-in

An Admin gives each person a one-time code from their record in the portal:

1. **Open the person in `People`**, go to the `Details & access` tab and press `Generate a code` in the `Staff app` panel.
2. **Press `Print the slip` or `Copy`.** The code is 12 characters and is shown once only.
3. **Give the slip to the person.** In the app they tap `First time? I have a code`.
4. **They enter the code, an email address and a password** of at least 8 characters, and tick the terms box if shown.

The code works once. It expires 14 days after it was printed (`SLIP_DAYS` in `lib/compute.ts`). `New code` replaces an unused code, and `Cancel the code` withdraws it. A person who already has a sign-in cannot be given a code until their access is removed.

The email address is theirs to choose, but each sign-in needs its own.

A forgotten password cannot be reset by email: the linen room removes access and gives a new code.

| Record | Change | Undo |
|---|---|---|
| Staff record | A code and its print date are stored | `Cancel the code` |
| Staff account | Created with the email and a hashed password; the code is spent | `Remove access` |

## What a staff member sees and can do

The bar at the bottom has `Home`, `My kit`, `Orders` and `Messages`. A fifth appears for a manager, for anybody on the ward desk, and for anybody a request is waiting on: `Team`, or `Ward` for somebody only on the desk.

- **Home** shows the request furthest along with its collection code once ready, how many garments they hold, and shortcuts.
- **My kit** lists what the linen room has recorded against them. `This isn't right` raises a query. `Slips` shows each slip the counter sent them: the date, the garments and sizes, and their signature.
- **Request** asks for garments with a reason, and goes to the manager recorded on their staff record.
- **On the shelf** shows each size as `In stock`, `Low` or `None on shelf`, with when it was last counted.
- **Waitlist** is offered for a size with none on the shelf, showing their place before they join. Accepting a held garment raises a request to their manager.
- **Report damage** can also request a replacement; the garment leaves their record only when handed in at the counter.
- **Kit check** is open only while the linen room is running one; Home prompts for it, and they confirm how many of each they still have.
- **Orders** lists their open and finished requests, each with a message thread.
- **Messages** lists every thread with the linen room, newest first with the order each belongs to, and a `Start one` list of requests nobody has asked about yet.
- **Showing the code at the counter.** `Show at the counter` opens a ready request's collection code full screen — the digits, their name and what is in the bag.
- **Account** holds their notification switches, `Change your password` (a new password signs them out on every other phone or browser), the privacy links and `Sign out`.

## Notifications

On Android, the app can tell somebody when their request is approved or declined, when a bag is ready to collect, when it goes out on the ward round, when a kit check opens, and — for an approver — that something is waiting on them. Each of those is a switch on their `Account` screen.

A notification carries the request's reference and the garment names, and nothing else: never the collection code, never a count, never money, because the body is drawn on a lock screen. Tapping one opens that order.

Android asks permission when somebody turns a switch on, never at launch. In a browser the switches say notifications arrive in the app on their phone; an app older than the notification build says to update it. Where the server has no notification setup, the switches are greyed out and say so — see [notifications](/docs/selfhost/notifications).

## What they never see

- prices, costs or any payment
- stock numbers: the shelf is shown in words only
- anyone else's record, unless that person reports to them as a manager

They cannot delete their own account; only the linen room can.

## Manager functions

Somebody becomes a manager when a register entry names them as its manager. See [Managers](/docs/people/managers). They get:

- **Approvals.** Home shows how many requests are waiting. They approve or decline each line, with a reason when they decline.
- **Approve by link.** The email about a new request links to `/my/approve`, which needs no sign-in. The link lasts 14 days and stops working once the request is decided or either person leaves the register.
- **Ward.** Who on their team holds what, with each person's set count.
- **Raise for your team.** A request typed for someone who reports to them; it goes to the manager's own manager.

A person with `On the ward desk` ticked in the `Staff app` panel also gets `Ward round`, where bags delivered to their ward are signed for. Whoever signs is named on the order. See [Delivery rounds](/docs/counter/delivery-rounds).

## Permissions and connection

ThreadCount Staff asks for internet access, and for permission to show notifications when somebody turns a switch on in `Account`. It asks for nothing else: no camera, location, contacts, files, photos or microphone. It has no scanner and works online only.

Losing signal shows a bar reading `No signal. Nothing you typed is lost.` with a `Retry` that re-checks the connection; a half-written message stays in its box. Nothing is queued to send later, and `Retry` never re-sends a request: it cannot know whether the first arrived, so it asks them to check `Orders`.

## Having access removed

On the person's `Details & access` tab, an Admin presses `Remove access` in the `Staff app` panel and confirms. The staff account is deleted and every session ends at once. Their register entry and issue history stay.

Changing their own password also unregisters that person's phones from notifications; the phone they still hold re-registers the next time they turn a switch on.

`Deactivate` in the `Register` panel also stops their sign-in straight away, with the message `You're no longer on the register at this facility.` See [Deactivating and deleting](/docs/people/deactivating-and-deleting).
