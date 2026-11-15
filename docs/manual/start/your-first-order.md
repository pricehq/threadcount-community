---
title: Your first order
section: start
order: 4
summary: From the To order list on Orders to a delivery on the shelf, including what happens when it arrives short.
screen: Orders
role: Admin
keywords: order, ordering, purchase order, supplier, reorder, raise, to order, order list, order and email, on the way, csv, email supplier, receive, delivery, back order, invoice
---

## Before you start

The `To order` list depends on two things you set up once.

- **Reorder levels.** A size appears on the list when its on-hand figure is at or below its level. The same sizes show under `At reorder` on `Stock › On hand`. See [Reorder levels](/docs/stock/reorder-levels).
- **Suppliers** under `Settings › Catalogue & suppliers`: `Account no.`, `Order email` and `Lead time (days)`. Each garment names its supplier. See [Suppliers](/docs/stock/suppliers).

Enter each size's supplier code in the `Ordering` panel on the garment's page. A line with no code shows `no code`, which links to that garment.

## To order

On `Orders`, an Admin sees `To order`, with one panel per supplier in A to Z order. Each heading gives the lead time and order email, or `no email on file`. Issuers see `Recent orders` instead.

Each line is a size at or below its reorder level. The table shows `Code`, `Garment`, `On hand`, `Reorder`, `On order`, `Per week`, `Order` and `Cost`, with a button at the end of each line to remove it. The suggested quantity is twice the reorder level, less what is on hand and what is already on order, and never below 0. A line marked `runs out before this arrives` will run out before a delivery ordered today would arrive.

- Change any quantity with the stepper, or remove a line with `×`.
- `Add a line` adds any garment and size.
- If you have already placed the order on the supplier's website, type their order number into `Supplier order no.`. It is optional.
- `Sheet` prints the panel as it stands, before anything is raised.

The supplier's draft orders are listed under the table, each tagged `staff` for a person's order or `draft` for a stock draft, with its own `Supplier order no.` box. A person's order is never merged into the shelf's order.

## Order and email

Press `Order and email`. If the supplier has no order email, the button reads `Order` instead.

1. **The stock lines become one order** marked `Ordered`, with the supplier's order number as its reference. Lines left at zero are dropped.
2. **Each draft is raised with its lines unchanged** and marked `Ordered`.
3. **Each raised order is emailed** to the supplier, when the button said `Order and email`.
4. **The panel lists the raised orders**, with a count such as `1 order raised` beside the supplier name, each with `Print`, `CSV` and `Email`. Press `Done` to close it.

`Print` opens the A4 order sheet with the supplier's product codes. `CSV` downloads Supplier code, Description, Size, Qty and Unit cost. `Email` sends it again. An email is refused if the supplier has no email address, if email is not set up on the server, or if the order is a draft or cancelled.

## What is written

| Record | Change | Undo |
|---|---|---|
| Order | One new order for stock, `Ordered`, with a code like `ORD-2026-0001` and an expected date the supplier's lead time away, or 14 days if none is set | An Admin can `Cancel order` while it is Draft, Ordered, Shipped or Back Order |
| Draft order | Status changed to `Ordered` | Cancel, as above |
| Order | The time it was emailed or printed | None |

## Receive the delivery

Raised orders move to `On the way`, overdue ones first. When the boxes arrive, press `Receive` there, or open the order and press `Receive delivery`. Orders overdue or due within 2 days also appear under `Receive` on `Today`. An Admin can choose `Mark shipped` from the order's menu, though it is not required.

1. **Enter the invoice number and arrival date.** A note and `Photo the invoice` are optional.
2. **Enter what arrived on each line.** Each line starts at the quantity still outstanding. `Scan items off the box (camera)` adds one for each scan.
3. **Choose the destination.** `Shelf` puts the garments into stock. On an order for a staff member, `Pickup` puts them on the call list instead.
4. **Check the cost.** If the invoiced cost is not the catalogue cost, choose `Keep`, or an Admin can choose `Update catalogue cost`.
5. **Press `Receive`.**

The server refuses a line where more arrived than was outstanding, and refuses a delivery where nothing arrived.

## Back orders

Anything that did not arrive goes on a back order. The original order is marked `Received`. A new order with status `Back Order` is created for the shortfall. It keeps the same supplier reference and has the note `Back order — short on` followed by the original order's code. The original order links to it under `Back order`, and the new order's heading reads `back order of` and the original code.

When the rest arrives, receive the back order the same way. A received delivery cannot be reversed, so an Admin corrects the shelf with `Adjust quantity` instead. Every order, drafts included, is on the ledger at `Open the ledger`. There is more detail on [Receiving and back orders](/docs/stock/receiving-and-back-orders) and [The To order list](/docs/stock/order-list).
