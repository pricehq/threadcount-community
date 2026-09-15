---
title: Requests from staff
section: counter
order: 3
summary: Staff ask for uniform in the staff app, their manager decides each garment, the linen room picks the bag. Where requests appear, the queue, codes, messages and the waitlist.
screen: Requests
role: Admin or Issuer
keywords: request, ward request, staff request, requests queue, approve, declined, pick, start picking, bag, collection code, hold, messages, waitlist, needs an approver, withdraw, re-address
---

A request is one ask for one person, raised in the staff app and approved by that person's manager before the linen room can act.

## What staff can ask for

- Up to 10 lines, and between 1 and 20 of each garment. The same garment and size asked for twice becomes one line.
- A reason, from `Worn out`, `Damaged`, `Lost` and `Extra for shifts`, and a note of up to 400 characters.
- Only garments for their own staff group, or for every group, and in their uniform style.

A person with no manager recorded cannot raise one. Each request gets a code such as `R-0042`. See [Staff app](/docs/apps/staff-app) and [Manager approvals](/docs/counter/manager-approvals).

## Where requests appear

- **Today.** `Pick for approved requests` lists approved requests. A row reads `in stock` with `Start picking`, or `none on the shelf` with `Order it in`, which opens `New order` for that person with the short lines filled in.
- **A person's record.** The `Requests` tab lists theirs, `Open` or `All`, with `Open in the queue`.
- **The queue.** The `Requests` button on `People` opens every request. On a phone it is `Requests` in the portal’s `More` sheet.

| Queue tab | Holds |
|---|---|
| `To do` | Approved and not yet handed over |
| `Needs an approver` | Waiting, with nobody asked to approve |
| `Open` | Everything not yet finished, waiting ones greyed |
| `All` | Every loaded request |
| `Record queries`, `Damage`, `Kit check & waitlist` | The staff app's other reports |

The queue loads the latest 400 requests; older ones are on the person's record. When any request has no approver, a line reads `<n> with no approver` with `Address them`. `Export CSV` writes the tab on screen.

On a phone, `Work › Picks` in the [counter app](/docs/apps/counter-app) lists approved requests. Tick or scan each line, then `Hand over`: the person signs and the request moves straight to collected.

Opening a request lists every line with its decision. A declined line is struck through with its reason and is never picked.

## The bag

1. **Press `Start picking`.**
2. **Hold it at the counter or send it on the ward round.** `Hold at the counter` takes an optional `Held until` note, such as `Fri 6pm`. `Send on the ward round` is covered in [Delivery rounds](/docs/counter/delivery-rounds).
3. **Match the code at the counter.** Holding gives the bag a 4-digit collection code, different from every other bag waiting at the counter.
4. **Press `Collected`** when the person takes it.

Holding at the counter emails the person with the code and the held-until note, when they have a staff-app account and email is set up. The note is text; nothing expires on it.

`Collected` checks the shelf and refuses `Not enough <garment> <size> on the shelf to hand over — count the shelf or order it in first.` It writes an issue for each approved line and adds the garments to the supplier's replenishment draft.

A request moves only forward. A stale screen gets `A request that is "<status>" can't move to "<status>".` or `Somebody else moved that request just now — reopen it.`

`Collection slip`, `Delivery slip` and `Print order form` print the approved lines ([Slips and signatures](/docs/counter/slips-and-signatures)).

## Messages

Each request has its own messages. You reply in `Reply to this order` and press `Send`. Replies are named `(linen room)`. ThreadCount sends no email when you write a reply. The request's `History` lists every step, who took it and when.

## Stuck requests

A request waiting on nobody, or on a manager who will never answer, has two ways out:

- **Re-address it.** Choose a name and press `Ask them` or `Re-address`. People without a staff-app account are listed under `Can’t be asked — no staff-app account`. The person who raised it is left out. The wearer is listed only when set as their own manager, and choosing them is a self-approval.
- **Withdraw it.** `Withdraw it` declines the request with the reason `Withdrawn — no approver available` and emails the person when they have an account.

Deactivating a person closes their waiting requests.

## The waitlist

Staff join a waitlist for a garment and size in the staff app. The `Kit check & waitlist` tab lists who is waiting under `Waiting for a size`.

When the size arrives, press `It’s in — offer it`. The garment is held for 48 hours, and the person is emailed when they have an account. Accepting in the staff app raises a request, which still needs their manager. After 48 hours the row reads `Hold lapsed — offer to the next person`.

An offer is refused when the garment is now outside the person's staff group or uniform style, with a message ending `Take them off this waitlist instead.`

Starting a kit check and closing it are Admin only.

## What is written

| Record | Change | Undo |
|---|---|---|
| Request | Status, collection code, held-until note, a history line per step | None; it only moves forward |
| Issue | One row per approved line on `Collected` | Record a return |
| Message | Your reply, with your name | None |
| Waitlist entry | Offered time | None |
