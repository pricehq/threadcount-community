---
title: Pickup call list
section: counter
order: 5
summary: Garments ordered in for a person wait in Call to collect on Today until they are picked up. Days waiting, called, the slip and picked up.
screen: Today
role: Admin or Issuer
keywords: pickup, call list, call to collect, awaiting pickup, collection, collected, picked up, contacted, mark called, ring, phone, waiting, fortnight, order in
---

The call list is the `Call to collect` group on `Today`. It holds every pickup that has arrived and has not been picked up or delivered, except the bags going out on a delivery round.

## How a line joins it

A pickup starts as an order for a staff member, raised with `Order in` on [Counter](/docs/counter/issue-a-garment), or with `Order for a person` on `Orders` ([The To order list](/docs/stock/order-list)).

When the delivery is received, each line goes to `Shelf` or `Pickup`. Pickup lines become one pickup for that person; shelf lines go into stock. A short delivery is split off as a back order. See [Receiving and back orders](/docs/stock/receiving-and-back-orders).

The garments count towards the person's ceiling from the day they are ordered.

## Call to collect or the round

A pickup goes to `Deliver on the delivery round` instead when nobody has called about it and the person's team has an active person with the team desk flag. Pressing `Mark called` on a person's record moves it back to `Call to collect`. See [Delivery rounds](/docs/counter/delivery-rounds).

A group with nothing in it is not shown. When the whole queue is empty, `Today` reads `Nothing in the queue.`

## Reading the list

Rows are sorted by days waiting, longest first. Days waiting runs from the received date to today.

Each row shows the days waiting, the person's name and phone number (a call link where the device can dial), each garment with size and quantity, the order code, and `contacted` once called.

A pickup waiting 14 days or more is flagged. Those pickups count towards the `overdue` figure in the `Today` heading. The rail badge shows everything in the queue, not the overdue figure; an overdue pickup only changes the badge's colour.

## Called, slip, picked up

1. **Ring them, then press `Mark called`.** The button goes and the row reads `contacted`. No screen unmarks it.
2. **Print the `Slip`** if the bag needs one. It carries the name, team, number of garments, the order's reference (or its code), the date received, and a tick against `Phone` under `Staff notified` once called. `Date notified` prints blank. It does not list the garments.
3. **Press `Picked up`** when they collect. The row leaves the list.

The same pickups are under `Waiting for her`, `him` or `them` on a person's `Uniform` tab, with `Mark called` and `Picked up`. The search panel lists them under `Waiting`, with `Picked up`.

When two people work the list at once, a refusal is shown above the rows. Pressing `Picked up` on a pickup already collected changes nothing.

## What is written

| Record | Change | Undo |
|---|---|---|
| Pickup | Contacted | No screen clears it |
| Pickup | Picked up today | No screen reverses it |
| Issue | One row per line: today's date, condition `New`, today's catalogue cost, the order code, marked as collected | Record a return from the person's record |

Picking up makes no ceiling check and stamps no ceiling override. It stamps `offGroup` or `offStyle` on a garment outside the person's staff group or uniform style.

It refuses one case: `Size <size> is no longer on <garment> — fix the catalogue before marking this picked up`. Put the size back on the garment, then press `Picked up` again.

## Hold period

A pickup has no hold period. Nothing expires: it stays until it is picked up or delivered. The 14-day flag marks it and does nothing else.

A staff request held at the counter carries a `Held until` note ([Requests from staff](/docs/counter/requests-from-staff)), and a waitlist offer is held for 48 hours. Neither applies to pickups.

> **In plain terms** The list is a queue of phone calls, and nothing leaves it on its own.

The counter app's `Work › Pickups` works the same list: `Call`, `Contacted` and `Collected` on each card. See [Counter app](/docs/apps/counter-app).
