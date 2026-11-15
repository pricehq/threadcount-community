---
title: Suppliers
section: stock
order: 7
summary: The supplier directory, the contact, account, order email and lead time each supplier carries, the supplier's code for each size, and where each is used.
screen: Settings › Catalogue & suppliers
role: Admin
keywords: supplier, vendor, supplier directory, lead time, account number, order email, contact, supplier code, product code, remove supplier, set supplier
---

## The supplier directory

`Settings › Catalogue & suppliers` lists every supplier the facility buys from under `Suppliers`, each in its own panel with the number of products and orders that use it.

1. **Type the name** into `New supplier`, for example `Northline Workwear`.
2. **Press Add supplier**, or Enter. A name already on the list, in any mix of capitals, is refused.

A supplier is also added when a garment is saved or bulk-changed with a supplier name the directory doesn't hold. The match ignores capitals, and the garment is stored with the directory's spelling, so `northline workwear` finds `Northline Workwear`.

A supplier's name can't be changed once added. **Export CSV** downloads the supplier, contact, phone, account number, order email, lead time, and the number of products and orders for each.

## Each supplier's details

| Field | What it holds |
|---|---|
| `Contact` | Who to ask for |
| `Phone` | The supplier's phone number |
| `Account no.` | The facility's account with the supplier |
| `Order email` | Where purchase orders are emailed; blank means print or CSV only |
| `Lead time (days)` | Days from ordering to delivery; blank means none set |

Changes save as you type. An order email that isn't an email address is refused, and it is stored in lower case. An Issuer sees the fields but can't change them.

## Where the details are used

- **Lead time** sets the expected delivery date: in `New order` when the supplier is picked, on orders raised from [To order](/docs/stock/order-list), and on back orders. With none set, those expect delivery in 14 days. The forecast reads it in weeks, and assumes 2 weeks when none is set (see [reorder levels](/docs/stock/reorder-levels)).
- **Lead time and order email** head each supplier's panel in `Orders › To order`, which shows `no email on file` when there is none.
- **Contact, phone, order email and account number** print on the A4 purchase order, and the account number goes into the email.
- **Order email** is the only address **Order and email**, **Email** and **Email supplier** send to. Without it, To order offers **Order** alone, and emailing an order is refused with a note to add an address.

## The supplier's code for each size

Suppliers number each size and colour of a garment separately. Record that code on the garment's page, in the `Ordering` panel's `Supplier code` column, against each size (up to 60 characters). It saves when you leave the box. An Issuer sees the codes but can't change them.

The code is printed against the line on the A4 purchase order, in the order CSV and in the order email, so it can be keyed into the supplier's own site. Where a size has none, the sheet, the email and the CSV from To order use the garment's SKU; the order page's CSV has a separate `SKU` column. On To order a missing code shows as `no code`, linked back to the garment's page.

The supplier code is separate from the barcode: it is what the supplier calls the size, and the [barcode](/docs/stock/barcodes) is what a scanner reads.

## Changing and removing a supplier

A garment's supplier is changed on its page with **Edit garment**, or for several at once with `Set supplier` on the bulk bar of `Stock › On hand`. Changing a garment's supplier doesn't change existing orders. An order's supplier can be changed in the order page's `Order details` until it is received or cancelled.

**×** on a supplier's panel removes it, and appears only when no product and no order uses it. The server refuses the removal otherwise.

> **In plain terms** A supplier that has ever been used stays in the directory, so its orders keep their contact and account details.

## What is written

| Action | Record · Change | Undo |
|---|---|---|
| Add supplier | Supplier record with its name | Remove it while nothing uses it |
| Edit a detail | That field on the supplier | Edit it again |
| Remove | Supplier record deleted | Add it again and re-enter the details |
| Supplier code | The code on that size of the garment | Edit or clear it |
