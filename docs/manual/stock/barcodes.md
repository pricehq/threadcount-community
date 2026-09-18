---
title: Barcodes
section: stock
order: 2
summary: Binding the supplier's barcode to each size, dealing with an unknown code once, printing ThreadCount's own labels, and the formats the scanners read.
screen: Stock › a garment
role: Admin
keywords: barcode, scan, bind, unbind, unknown barcode, label, print labels, generate barcode, scan sizes, scan to add, EAN-13, Code 128, scanner, GTIN
---

## Supplier barcodes

Each size of a garment carries one barcode, and a code belongs to one size in the facility. Most garments arrive with the supplier's code on the swing tag, and that is the code to bind.

1. **Open the garment.** `Stock › On hand`, then the garment's name.
2. **Press Scan sizes.** The dialog starts on the first size with no barcode.
3. **Scan each size's label.** After each scan it moves to the next unbound size. **Scan** or **Re-scan** on a row points it at that size instead.
4. **Add a size while scanning.** Type it into `Size that isn't on the item yet`, then scan. The size goes on the end of the list with its code.

Codes can also be bound in bulk from `Settings › Data & audit log` with the Supplier barcodes template.

## An unknown code

On `Stock › Count`, a code that matches nothing opens the `Unknown barcode` dialog. An Admin picks the garment, then clicks the size, and the code is bound from then on. An Issuer sees the code and is told only an admin can bind it. **New product from this barcode** (Admin) opens `Add catalogue item` with the code waiting for its size.

A scanner used outside any field on another screen opens the search panel with `No person or garment has` the code. Admins get **Bind it to a garment** there, which opens the same dialog.

**Scan to add**, at the top of `Stock` (Admin), works through a pile of garments: a known code offers **Open product**; an unknown one offers a new product or a binding to a garment you already have.

The dialogs check the digits. A code that fails its check digit is flagged as a possible mis-read but can still be bound, and so can a code of a non-standard length.

With `Settings › Catalogue & suppliers › Look up unknown barcodes in public databases` ticked, `Scan to add` sends the barcode number, and nothing else, to UPCitemdb, then Open Products Facts, and shows any product name found. Only valid EAN-13, UPC-A, EAN-8 and GTIN-14 codes are looked up, up to 120 an hour per facility. It is off by default.

## Typed, generated and moved codes

The garment page's `Sizes` panel has a barcode box on each row (Admin). Type or scan the code and press Enter or **Save**. Codes may carry letters. To take a code off, clear the box and confirm, or press **×**.

**Generate barcodes**, in the garment page's menu, gives every size without a code one of ThreadCount's own; **Generate** on a row does one size. Sizes with a supplier code keep it. A generated code is a 13-digit EAN-13 starting `29`, the GS1 range for use inside one business, with a real check digit. Numbers come from a counter held for the facility, so two people labelling at once can't be given the same one.

A code already on another garment is refused with where it is. Confirm the move, or press **Move … onto size … anyway** in `Scan sizes`, and the code leaves the old size for this one. Binding a code that is another garment's internal `93` number is refused.

## Printing labels

**Print labels (N)**, in the garment page's menu, prints one label for every garment on hand across the sizes that carry a barcode. It asks first, then opens an A4 sheet, 2 labels across, in a new tab.

Each label carries the garment name, size, SKU, and the bars with the code. A valid EAN-13 prints as EAN-13; any other code prints as Code 128. A code too long to print at a scannable size is flagged above the sheet. With no size labelled, or nothing on hand, the sheet says which instead of printing.

## Accepted formats

- The camera reads EAN-13, EAN-8, UPC-A, UPC-E, Code 128, Code 39 and Code 93. QR codes are ignored.
- A scanner that types the code and presses Enter works in the scan boxes. See [keyboard and scanner](/docs/reference/keyboard-and-scanner).
- A bound code can be up to 64 characters.

## What is written

| Action | Record · Change | Undo |
|---|---|---|
| Bind a code (scan, type or pick) | Barcode record: code, garment, size position | Clear the box, or press × |
| Move a code | The same record now points at the new size | Move it back |
| Generate | Barcode record marked generated; the facility's number counter moves on | Unbind; the number is not handed out again |
| Remove a size | Its barcode is deleted with it | Bind the code again |
| Print labels | Nothing | Nothing to undo |
