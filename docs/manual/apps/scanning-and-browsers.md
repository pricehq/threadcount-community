---
title: Scanning and browsers
section: apps
order: 3
summary: USB scanners, the barcode formats ThreadCount reads, which browsers can scan with the camera, the Android scanner, and what happens with a code it doesn't know.
role: Admin or Issuer
keywords: scan, scanner, barcode, usb, camera, counter, stock count, unknown barcode dialog, product lookup, chrome, edge, safari, firefox, iphone, ean, upc, code 128, unknown barcode, bind, label, print
---

ThreadCount reads a barcode from a USB scanner, the camera in a supported browser, or the scanner built into the Android counter app. Wherever you can scan, you can also type the code.

## USB scanners

A USB scanner that types the code and then presses Enter works with any browser. In the portal these boxes accept one:

| Screen | Box |
|---|---|
| `Stock › Count` | `Scan to count +1` |
| `Counter`, in `Issue` mode | `Scan a garment, or type a name`, in `Add garments` |
| `Stock › Scan to add` | `Scan with a USB scanner, or type the code and press Enter` |
| A garment's `Scan sizes` | The prompt names the size to scan next |

`Scan to add` and `Scan sizes` bind codes, and only Admins see them.

You can also scan with no box selected. The portal takes 4 or more keys, each within 35 ms of the last and ending in Enter, as a scan. A staff number opens that person at the `Counter`. A garment goes into the pickup when the counter has a person open, adds 1 on `Stock › Count`, and otherwise opens the garment's page. See [Keyboard and scanner](/docs/reference/keyboard-and-scanner).

## Formats it reads

Camera scanning, in the browser and in the Android app, reads these formats only:

- EAN-13 and EAN-8
- UPC-A and UPC-E
- Code 128, Code 39 and Code 93

ITF and Codabar are left out: with no check digit, a partial read can pass as a different code. No 2D codes are read.

A USB scanner or a typed code isn't limited to that list. In `Scan to add`, a 13-, 12-, 8- or 14-digit code has its check digit tested. If it fails, you see `check digit doesn't match — the scan may have mis-read`.

## Camera scanning in a browser

In a browser, the camera reads barcodes with the browser's built-in barcode detector.

| Browser | Camera scanning |
|---|---|
| Chrome | Yes |
| Edge | Yes |
| Safari on iPhone or iPad | No |
| Firefox | No |

Where the camera opens but the browser can't read barcodes, the screen says `Live reading isn't supported here — type the code instead.` With no camera access at all, it says `This browser has no camera access — type the code instead.` On an iPhone, type the code or use a USB scanner.

## The Android scanner

Inside the **ThreadCount** Android app, the phone's own scanner reads the code. If the app can't load it, the browser detector is used.

When counting a shelf with `Hands-free` on, scanning stays on until you turn it off. The same code again within 0.9 seconds counts as the same garment still in view. `Beep and buzz on a scan` in `Settings` turns the sound and vibration on or off for that phone.

The ThreadCount Staff app has no scanner.

## Codes ThreadCount doesn't know

A code is known once it is bound to one size of one garment. In the counter app, an unknown code gives:

- **Counting a shelf:** `isn't a garment ThreadCount knows. Bind it to a size first`. A known code from another shelf names that shelf instead.
- **Issuing:** `isn't a garment ThreadCount knows.` Nothing is added.
- **Scan tab:** `Not found`, with the code. An Admin can bind it to a size.

In the portal:

- **`Stock › Count`:** the `Unknown barcode` dialog opens. An Admin binds the code there; an Issuer is told only an admin can bind it.
- **`Counter`:** an Admin gets the same dialog; an Issuer sees `No garment has` and the code.
- **Scanned with no box selected:** the search panel opens with `No person or garment has` and the code, and Admins get `Bind it to a garment`.
- **`Scan to add`:** you can start a new product from the code, or attach it to a size you already have.

With `Look up unknown barcodes in public databases` ticked in `Settings › Catalogue & suppliers`, `Scan to add` first asks a public barcode database for a product name. With it off, nothing leaves the server.

A code can be on one size only. Binding one already on another garment is refused unless you choose to move it. See [Barcodes](/docs/stock/barcodes).

## Printing ThreadCount barcodes

For garments that arrived without a barcode, an Admin opens the garment from `Stock` and chooses `Generate barcodes` from its menu. Each size without a code gets one of ThreadCount's own. These are EAN-13 codes starting `29`, a prefix for use inside one business, with a real check digit. A size with a supplier's code keeps it.

`Print labels`, in the same menu, asks you to confirm the count, then prints one label per garment on hand for each size with a code, two to a row on A4. With none to print, the sheet says why. A 13-digit code with a valid check digit prints as EAN-13, and any other code prints as Code 128.

In the counter app, a stock line's `Print a label` prints 1 to 20 copies of that size's label, when the size has a barcode bound.

Each location also has a shelf label: a Code 128 barcode starting `TCL-` with the location's name. Print it from the `Label` button on `Stock › Count a shelf`. Scanning it in the counter app starts a count of that shelf.

Inside the Android app, labels print through Android's print dialog, which lists every installed print service. See [Counter app](/docs/apps/counter-app).

> **Careful** A garment without a readable barcode drops out of every scanned count. Reprint worn labels before the next stocktake.
