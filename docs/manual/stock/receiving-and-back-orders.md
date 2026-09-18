---
title: Receiving and back orders
section: stock
order: 6
summary: Booking a delivery in against its order, recording the invoice, splitting short lines to a back order, and sending garments to the shelf or a pickup.
screen: Orders › an order › Receive delivery
role: Admin or Issuer
keywords: receive, receive delivery, delivery, goods received, invoice, back order, short delivery, partial delivery, pickup, shelf, invoiced cost, docket, on the way, overdue
---

## Before a delivery can be received

A delivery is received from three places: **Receive** on a row of `Orders › On the way`, **Receive delivery** on the order's own page, and **Receive delivery** in the `Receive` group on `Today`, which lists orders due within 2 days or overdue.

**Receive delivery** appears on an order that is `Ordered`, `Shipped` or `Back Order`. A draft has to be marked ordered first, and a received or cancelled order can't be received again. **Mark shipped**, in the order page's menu (Admin), is optional and changes nothing about receiving.

The order page's `Units received` figure shows how many units have arrived against how many were ordered.

## Ticking the lines

The `Receive delivery` dialog lists each line of the order:

- `Outstanding`: ordered less already received.
- `Arrived`: filled in with the outstanding figure. Change it to what is in the box.
- `Destination`: `Shelf`, or `Pickup` when the order is for a staff member. A staff member's order starts on `Pickup`; an order for stock has only `Shelf`.
- `Invoiced cost`: the unit cost on the invoice, filled in with the catalogue cost.

**Scan items off the box (camera)** adds 1 to a line for each garment scanned, and names a garment that isn't on the order.

An arrived figure above the outstanding one is refused. Book surplus in with `Adjust quantity › Receive` from `Stock › On hand`, which records it as received without an order. At least one line needs a quantity.

## Invoice, date and price

1. **Enter the invoice number.** It is kept on the delivery and on the order.
2. **Check the arrival date.** It starts on today in the facility's time zone.
3. **Add a note** if something was wrong, and **Photo the invoice** if you want it on file.
4. **Check any price flag.** When an invoiced cost differs from the catalogue, the line shows both. **Keep** leaves the catalogue alone; **Update catalogue cost** (Admin) changes it and adds a price history entry.
5. **Press Receive.**

On the order page, a line whose delivered units were invoiced at a different price is marked `invoice price`.

## Short lines become a back order

Receiving closes the order as `Received`, whatever arrived. Anything short is moved onto a new order:

- Status `Back Order`, for the same supplier, person, cost centre and supplier reference.
- Its note reads `Back order — short on` and the original order number.
- Its expected date is today plus the supplier's lead time, or 14 days when none is set.

The two orders link to each other: the back order's page says `back order of` the original, and the original lists its back orders under `Lines`. A back order is received the same way, and anything short on it goes to another back order. Cancel one the supplier won't fill with **Cancel order** (Admin).

## Where the garments go

- **Shelf** lines are added to stock on hand for their sizes straight away.
- **Pickup** lines are not put on the shelf. They become one pickup for the staff member, which appears on `Today` under `Call to collect` or `Deliver on the delivery round`. See the [pickup call list](/docs/counter/pickup-call-list).

The order's `History` panel adds a `Delivery received` entry with the invoice number, each line and where it went, and an **Invoice photo** button when one was taken. A received order's details are locked.

> **Careful** There is no undo for a delivery once received; a wrong quantity is corrected on the shelf with Adjust quantity.

## What is written

| Action | Record · Change | Undo |
|---|---|---|
| Receive | A delivery record (date, invoice, note, photo) with a line per arrived size (quantity, destination, invoiced cost); the order set to `Received` with its invoice and received date, the note added to its notes | None; correct stock with Adjust quantity |
| Short lines | New `Back Order` order linked to the original | Cancel order (Admin) |
| Shelf lines | Stock on hand for those sizes goes up | Adjust quantity (Admin) |
| Pickup lines | A pickup for the staff member with those lines | None from this dialog |
| Update catalogue cost | Catalogue unit cost; a price history entry | Change the cost on the garment page |
