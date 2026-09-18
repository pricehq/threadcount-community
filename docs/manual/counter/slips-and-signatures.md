---
title: Slips and signatures
section: counter
order: 7
summary: Every document the counter and a person's record print, where each prints from, what it carries, and which signatures ThreadCount records.
screen: Counter
role: Admin or Issuer
keywords: slip, print, printing, collection slip, delivery slip, order form, credit slip, hand-in receipt, access slip, signature, signed, mark signed, receipt, receipts to sign, paper
---

Each document opens in a new window and starts the browser's print dialog. If nothing opens, allow pop-ups for ThreadCount.

## The documents

| Document | Printed from | Paper |
|---|---|---|
| Collection slip | `Counter` (`This pickup`), `Today` (`Slip` in `Call to collect`), the request queue | A4 |
| Delivery slip | The request queue | A4 |
| Order form | `Counter` (`Order form`), a person's `Uniform` and `History` tabs, the request queue | A4 |
| Credit slip | `Counter` (`Credit slip`), a person's `History` tab | A5 landscape |
| Hand-in receipt | The hand-in dialog, `Counter` in `Hand in` mode, a person's `History` tab | A5 landscape |
| Access slip | A person's `Details & access` tab | A5 landscape |

Garment labels and the supplier order sheet print from `Stock` and `Orders`: see [Barcodes](/docs/stock/barcodes) and [The To order list](/docs/stock/order-list).

## Collection and delivery slips

Both carry the facility logo, or `Organisation name on slips`, from `Settings › Facility`. Both carry `Staff name`, and `Collection code` beside it for a request held at the counter.

When garments are passed, `Garments — tick each one as it goes in the bag` lists them. Up to 10 lines print; the rest show as `+<n> more lines — see the request in ThreadCount.`

| Slip | Fields | Signature |
|---|---|---|
| `Uniform ready for collection` | Team, Date received, PO / Order no., Garments, Staff notified, Date notified | `Collected by (signature)`, `Date collected` |
| `Uniform team delivery` | Team, Deliver to (location in the team), Garments, PO / Order no., Date received, Requested by (manager / staff), Delivered by, Date / time | `Received for the team by (name + sign)` |

The footer is `Collection slip footer` or `Delivery slip footer` from `Settings › Facility`.

What each screen fills in:

- **Counter.** The shelf and pre-loved lines in the pickup, marked `(pre-loved)` where they are; `Order in` lines are left off. The button works only when the pickup could be recorded and has a shelf or pre-loved line.
- **Request queue.** The approved lines, with the cut named unless unisex. `PO / Order no.` is the request code. A request on the delivery round prints a delivery slip, any other a collection slip. A waiting or declined request has no slip.
- **Today.** Name, team, garment count, the order reference, date received, and a `Phone` tick once called. No garment list.

## Order form

The form the manager signs. It prints three ways:

- From `Counter` or `Print a new one` on the `Uniform` tab, with the person's details and blank garment rows.
- From `Print order form` in the request queue, or `Print the form` on a request row under `Previous order forms`, with the garments written on. A request still waiting prints with the manager's block blank.
- From `Print the form` on a recorded approval, as a copy. It prints what was recorded, and `Signature (on the signed sheet)` stays empty.

It has a `Staff member signature` line, a `Manager / financial delegate approval` block, and an `Office use only` block including `Date ordered`, `PO number`, `Invoice number`, `Stock received` and `Date collected`. See [Manager approvals](/docs/counter/manager-approvals).

## Credit slip, hand-in receipt and access slip

- **Credit slip.** `Uniform Credit`, the sets left on one approval (`2 of 5 sets remaining`), the person, who approved it and when, the FTE and notes. It tells the person to bring the slip or their payroll number to collect the rest. On `Counter` it prints the open approval.
- **Hand-in receipt.** Each garment, size, quantity and condition, `unlaundered` where marked, how many went to the pre-loved pool and to rag disposal, and whether the allowance was credited ([Exchanges and returns](/docs/counter/exchanges-and-returns)).
- **Access slip.** `Print the slip` after `Generate a code`: the one-time code a person uses to claim their staff-app account, with the steps ([Staff app](/docs/apps/staff-app)).

A hand-over sent from the counter app also reaches the person as a slip in the staff app, under `My kit ▸ Slips`. It shows the date, each garment and size with how many were signed for, and their signature where one was drawn.

## Signatures

ThreadCount does not read ink. What it records:

| Where | What is recorded | By |
|---|---|---|
| An issue | The signed tick | You, after the slip is signed |
| A delivery on `Delivery rounds` | The drawn signature as an image, the receiver's name, and the signed tick on the issues | The receiver, on screen |
| A request bag on the delivery round | The signer's name, role and time; no image | The team desk, in the staff app |
| An issue or request hand-over in the counter app | The drawn signature as an image, the signed tick, and a slip in the staff app when sent | The person, on the phone |
| A manager's approval | A photo of the signed order form, if taken | You, when recording it |

The signed tick is `Mark signed` or `Signed` under `Holding` in the counter's `Return` and `Hand in` modes, and `signed` or `not signed` on a person's `Uniform` and `History` tabs.

`Today`'s month-end panel shows `<n> receipts to sign` when any issue lacks the tick, with `Chase`, which opens `People` filtered to `Receipts to sign`.

How drawn signatures and photos are stored and removed is on [Delivery rounds](/docs/counter/delivery-rounds).

> **In plain terms** Paper carries the signature; ThreadCount carries a tick, a name, or a picture of the paper.
