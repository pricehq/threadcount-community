---
title: Delivery rounds
section: counter
order: 6
summary: Take waiting pickups to the wards and have the receiver sign on screen. Which bags go on the round, how signatures are stored and removed, and the ward round for staff requests.
screen: Today › Deliver on the round
role: Admin or Issuer
keywords: delivery round, delivery rounds, round, deliver on the round, start the round, ward, deliver, trolley, signature, sign, received by, handover photo, proof, ward desk, ward clerk
---

ThreadCount has two rounds. `Delivery rounds` takes pickups, garments ordered in for a person, to the wards. Approved staff requests go on the ward round, signed for by the ward desk in the staff app.

## Which bags go on the round

`Today` lists bags for the round under `Deliver on the round`, one row per ward, with the names, the garment count and `signed for at the ward desk`. A pickup goes there when nobody has called about it and the person's ward has an active person with the ward-desk flag. Every other pickup stays on [Call to collect](/docs/counter/pickup-call-list).

`Start the round` opens `Delivery rounds` for that ward. The screen is not on the desktop menu; on a phone it is `Delivery rounds` in the `More` sheet.

## The rounds screen

`Delivery rounds` lists every pickup not yet picked up or delivered, whether or not it was put on the round, grouped by the ward on the person's staff record. A person with no ward recorded is listed under `Unknown`. Each ward panel shows its cost centre and how many are to deliver. With more than one ward, a `Ward` bar picks one or `All`.

Each row shows the days waiting, the person, their phone number, the garments and the order code. A pickup waiting 14 days or more is flagged.

## Handing over

1. **Press `Delivered — sign`** on the row.
2. **Type the receiver's name** in `Received by (name)`.
3. **Have them sign** in the `Signature` box. `Clear` wipes it.
4. **Press `Add handover photo`** if you want one.
5. **Press `Mark delivered`.**

The name, signature and photo are each optional. In the [counter app](/docs/apps/counter-app), `Work › Rounds` lists each ward. One signature, an optional name and an optional photo mark every bag for that ward delivered.

| Record | Change | Undo |
|---|---|---|
| Pickup | Picked up today, the name typed, the signature and photo linked, marked as delivered on a round | No screen reverses it |
| Issue | One row per line, as `Picked up` writes, marked signed when a signature was drawn | Record a return |
| Photo | The signature, and the handover photo if taken | See below |

Delivery refuses `Already handed over` when the pickup was picked up or delivered first, and `Size <size> is no longer on <garment> — fix the catalogue before marking this delivered`.

## How signatures are stored and removed

The signature is saved as a PNG image before the delivery is recorded. An image may be up to 700 KB. It is kept as a file on the server, and the database holds a pointer to it. A self-hosted server keeps the files in the folder named by `PHOTO_DIR`, or `.photos` in the app's folder when that is unset ([Configuration reference](/docs/selfhost/configuration-reference)).

No screen deletes a single signature. Images are removed in two cases:

- An image nothing refers to, such as a signature saved for a delivery that then failed, is deleted once it is more than 1 day old. The clean-up runs on about 1 image save in 20.
- Wiping the facility's activity or starting fresh removes every image the facility holds, under `Settings › Data & audit log`.

A backup carries up to 2000 images, and up to 40 MB of them.

> **Careful** A wipe of activity removes every delivery signature at once, with no way to keep some.

## The ward round for staff requests

In the request queue, a request being picked has `Send on the ward round` ([Requests from staff](/docs/counter/requests-from-staff)). It refuses in two cases:

- `<first name> has no ward recorded, so there is no round to send this on. Hold it at the counter, or record their ward on the staff register first.`
- `Nobody on <ward> can sign for a round bag — that needs somebody with the ward-desk flag and their own staff-app account. Hold it at the counter instead, or set the flag on their staff record first.`

The ward-desk flag is `On the ward desk`, set by an Admin in the `Staff app` panel of a person's `Details & access` tab.

The wearer is emailed when they have an account and email is set up, and their phone is told as well where notifications are set up. Somebody on that ward signs for the bag in the staff app, under `Team ▸ Round`, or `Ward ▸ Round` for a clerk who is only on the desk. With more than one bag waiting, `Sign for all <n> remaining` signs them in turn and stops on the first it cannot, naming that person. No drawn signature is taken; the queue shows `Signed by <name>` with their role, and whether it has been collected from the ward. See [Staff app](/docs/apps/staff-app).

## Ward delivery notes

The paper that travels with a request bag is the delivery slip, `Uniform ward delivery`. Its footer is `Delivery slip footer` under `Settings › Facility`, which reads `After hours deliveries are left with the manager or team leader on duty.` until changed. See [Slips and signatures](/docs/counter/slips-and-signatures).
