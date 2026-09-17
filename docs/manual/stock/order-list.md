---
title: The To order list
section: stock
order: 5
summary: What to order, one panel per supplier and net of what is already on order, raised and emailed in one press, then the orders on the way and the ledger of every order.
screen: Orders
role: Admin
keywords: order list, to order, purchase order, reorder, supplier order, raise, order and email, supplier code, order sheet, print, CSV, email supplier, supplier order number, on the way, ledger, all orders, order history
---

## The Orders screen

`Orders` has three columns. Admins see `To order` on the left; an Issuer sees `Recent orders` there instead, the latest 10. The middle column, `On the way`, lists placed orders still open, overdue first, each with **Receive** (see [receiving](/docs/stock/receiving-and-back-orders)). `This month` counts the orders placed and received this month with their value, and **Open the ledger** goes to every order.

**New order** and **Order for a person**, at the top, are open to everyone. Both make a draft.

## What appears in To order

`To order` has one panel per supplier, A to Z, for every supplier with a size at [reorder](/docs/stock/reorder-levels) or a draft with lines. The panel heading shows the supplier's lead time and order email, or `no email on file`, and the number of lines and their value at catalogue cost.

Each size at reorder is a line, with a suggested quantity of twice the level, less what is on hand, less what is on order, never below 0. On order counts every open order and draft, so a quantity already on a draft is not suggested again. The supplier is the garment's, or the first in `Settings › Catalogue & suppliers` when it has none.

The columns are `Code`, `Garment`, `On hand`, `Reorder`, `On order`, `Per week`, `Order` and `Cost`. A size with no supplier code shows `no code`, linked to the garment's page. A size tagged `runs out before this arrives` is sorted to the top.

- The `Order` stepper changes a quantity; **×** takes a line off.
- **Add a line** adds any current garment and size, with a quantity.
- Edits stay on this screen until the panel is ordered.

## Drafts in the panel

Each of the supplier's drafts with lines is listed under the table, tagged `staff` when it is for a person or `draft` when it is for stock, with its own `Supplier order no.` box. A draft for a staff member is raised as its own order and never merged into the stock order, so each person's order stays separate from the shelf's.

## Ordering

The foot of the panel has `Supplier order no.` for the stock order: the number the supplier gives when the order is placed on their site. **Sheet** prints the panel as it stands.

**Order and email**, or **Order** when the supplier has no order email, raises the panel:

- The stock lines become a new order for stock, status `Ordered`, with the supplier order number as its reference and an expected date of today plus the supplier's lead time, or 14 days when none is set. Lines at 0 are dropped.
- Each draft becomes `Ordered`, taking its supplier order number if one was typed.
- If anything is refused, for example a draft somebody else has already placed, nothing is raised.
- With an order email on file, each order is then emailed, and the panel says `Sent to` the address or why it wasn't.

The panel then lists the orders raised, each with **Print**, **CSV** and **Email**, until **Done**.

## The sheet, the CSV and the email

**Print** opens the A4 purchase order (Admin): the order number and supplier reference; the facility, its location and organisation; the supplier with contact, phone and email; the date and expected date; the account number; the person it was ordered for, with department and cost centre; a row per line with the supplier code; and spaces for who ordered and the date placed. Where a size has no supplier code, the garment's SKU is used. Opening the sheet records when the order was printed. The same sheet is **Order sheet** on the order's own page.

**CSV** downloads the order number, supplier and supplier order number, then `Supplier code`, `Description`, `Size`, `Qty` and `Unit cost` per line.

**Email** sends the order to the supplier's order email. The subject reads like `Purchase order ORD-2026-0042 (NW-48211) — Riverside General`, with the lines, the account, the delivery location and an estimated value ex tax, asking the supplier to quote the order number on the invoice. It is refused for a draft, a cancelled order, a supplier with no order email, and a server with no email set up.

## The ledger

`Orders › All orders` lists every order. Search by order number, reference, invoice, tracking, supplier, person or garment, and filter by `Supplier`, `Garment`, `From`, `To` and `All`, `Draft`, `Open` or `Received`. `Open` means placed and not yet received or cancelled. **Export CSV** downloads the orders shown.

A garment's page lists every order line for it under `Orders`, and every change of unit cost under `Price history`.

## What is written

| Action | Record · Change | Undo |
|---|---|---|
| Order, stock lines | New order: stock, `Ordered`, reference, expected date, lines | Cancel order on the order page (Admin) |
| Order, a draft | Status `Draft` to `Ordered`; reference if typed | Cancel order (Admin) |
| Print sheet | The order's printed time | Nothing to undo |
| Email | Email to the supplier; the order's emailed time | None; the supplier has it |
| Sheet, CSV | Nothing | Nothing to undo |
