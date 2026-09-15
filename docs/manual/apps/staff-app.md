---
title: The staff app
section: apps
order: 2
summary: The app for people who wear the uniform. How a staff member gets a sign-in, what they see and can do, what managers get, and how access is removed.
screen: /my
role: Staff
keywords: staff app, details and access, wearer, nurse, self-service, code, slip, activation, sign in, kit, request, waitlist, damage, kit check, manager, approve, ward round, remove access
---

The staff app shows one staff member their own uniform record, and lets them ask the linen room for what they need. It is at `/my` in any browser. On Android it is also on Google Play as **ThreadCount Staff**, which opens the same screens. There is no iOS app.

A staff sign-in is not a coordinator account. It is attached to the person's entry on the register, and it cannot open `/app` or `/m`.

## Getting a sign-in

An Admin gives each person a one-time code from their record in the portal:

1. **Open the person in `People`**, go to the `Details & access` tab and press `Generate a code` in the `Staff app` panel.
2. **Press `Print the slip` or `Copy`.** The code is 12 characters in three groups and is shown once only.
3. **Give the slip to the person.** In the app they tap `I have a code` (or `First time? I have a code` on the sign-in screen).
4. **They enter the code, an email address and a password** of at least 8 characters, and tick the terms box if it is shown.

The code works once. It expires 14 days after it was printed (`SLIP_DAYS` in `lib/compute.ts`), and the panel says when it expires. `New code` replaces an unused code, and `Cancel the code` withdraws it. A person who already has a sign-in cannot be given a code until their access is removed.

The email address is theirs to choose and may be a personal one, but each sign-in needs its own.

A forgotten password cannot be reset by email: the linen room removes access and gives a new code.

| Record | Change | Undo |
|---|---|---|
| Staff record | A code and its print date are stored | `Cancel the code` |
| Staff account | Created with the email and a hashed password; the code is spent | `Remove access` |

## What a staff member sees and can do

The bar at the bottom has `Home`, `Kit`, `Orders` and `Messages`.

- **Home** shows the request furthest along (with its collection code once it is ready), how many garments they hold, and shortcuts.
- **Kit** lists what the linen room has recorded against them. `This isn't right` raises a query about the record. `Slips` shows each slip the counter sent them: the date, the garments and sizes, and their signature.
- **Request** asks for one or more garments with a reason. The request goes to the manager recorded on their staff record for approval.
- **On the shelf** shows each size as `In stock`, `Low` or `None on shelf`, and says when it was last counted.
- **Waitlist** is offered for a size with none on the shelf, showing their place before they join. Accepting a held garment sends it to their manager as a request.
- **Report damage** can also request a replacement. The garment leaves their record only when handed in at the counter.
- **Kit check** is open only while the linen room is running one, and Home prompts for it if they hold garments and haven't answered yet. They confirm how many of each they still have.
- **Orders** lists their open and finished requests, each with a message thread to the linen room.
- **Your sign-in** changes their password. A new password signs them out on every other phone or browser.

## What they never see

- prices, costs or any payment
- stock numbers: the shelf is shown in words only
- anyone else's record, unless that person reports to them as a manager

They cannot delete their own account; only the linen room can remove access.

## Manager functions

A staff member becomes a manager when someone on the register names them as their manager. See [Managers](/docs/people/managers). They get:

- **Approvals.** Home shows how many requests are waiting. They can approve or decline each line, with a reason when they decline.
- **Approve by link.** The email about a new request links to `/my/approve`, which needs no sign-in. The link lasts 14 days and stops working once the request is decided or either person leaves the register.
- **Ward.** Who on their team holds what, with each person's set count.
- **Raise for your team.** A request typed for someone who reports to them. It goes to the manager's own manager for approval.

A person with `On the ward desk` ticked in the `Staff app` panel on their `Details & access` tab also gets `Ward round`, where bags delivered to their ward are signed for. Whoever signs is named on the order. See [Delivery rounds](/docs/counter/delivery-rounds).

## Permissions and connection

ThreadCount Staff asks for internet access and nothing else: no camera, location, contacts, files, photos or microphone. It has no scanner and works online only. With no connection it shows `No connection.` and nothing is saved to send later.

## Having access removed

On the person's `Details & access` tab, an Admin presses `Remove access` in the `Staff app` panel and confirms. The staff account is deleted and every session it had ends at once. Their register entry and issue history stay.

`Deactivate` in the `Register` panel on the same tab also stops their sign-in straight away, with the message `You're no longer on the register at this facility.` See [Deactivating and deleting](/docs/people/deactivating-and-deleting).
