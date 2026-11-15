---
title: Keyboard and scanner
section: reference
order: 3
summary: Setting up a USB barcode scanner, where a scan goes on each screen, the formats ThreadCount reads and prints, the keys the screens answer to, and how printing works.
screen: Search or scan, Counter, Stock › Count
role: Admin or Issuer
keywords: usb scanner, keyboard wedge, enter, suffix, barcode, badge, ean-13, code 128, keyboard, shortcut, slash, ctrl k, search, escape, tab, print, labels, slip, pop-up
---

## Setting up a USB scanner

ThreadCount has no scanner driver. A USB scanner in keyboard mode (keyboard wedge) types the code and ends it with Enter.

1. **Set the scanner to keyboard mode.** Most are out of the box; the scanner's own manual has the setup barcode.
2. **Set the suffix to Enter (carriage return).** With a Tab suffix nothing is recorded.
3. **Scan a staff badge from `Today`.** `Counter` opens with that person chosen.

With no field selected, the portal treats at least 4 characters, each within 35 milliseconds of the last and ending in Enter, as a scan. While a field is selected, a dialog is open or the search panel is open, the portal does not watch for scans: the keys go wherever the cursor already is.

## Where a scan goes

With no field selected:

| What was scanned | Where you are | What happens |
|---|---|---|
| A staff number | Any screen | `Counter` opens with that person |
| A garment barcode | `Counter`, with a person chosen | That size is added to the pickup, in `Issue` mode |
| A garment barcode | `Stock › Count` | 1 is added to that size's count |
| A garment barcode | Anywhere else | The garment's page opens at that size |
| A code nobody has | Any screen | Search opens with `No person or garment has <code>.` |

Admins also get `Bind it to a garment` in that search panel. Scan fields that act on Enter:

- `Counter`, `Find a person`: an exact staff number, or else the first match.
- `Counter`, `Scan a garment, or type a name`: adds the size to the pickup.
- `Stock › Count`, `Scan to count +1`: selected when the tab opens.
- `Scan to add` on `Stock` (Admin): finds the garment, or offers to add it.
- `Scan sizes` on a garment's page (Admin): binds the code to the size it asks for.

An unknown code in the `Counter` box opens `Unknown barcode` for an Admin; an Issuer sees `No garment has <code>.` On `Stock › Count` the dialog opens for everyone, but only an Admin can bind. See [barcodes](/docs/stock/barcodes).

## Formats

| Where | Formats |
|---|---|
| USB scanner | Whatever the scanner types. A binding keeps up to 64 characters. |
| Camera, in the browser and the counter app | EAN-13, EAN-8, UPC-A, UPC-E, Code 128, Code 39, Code 93 |
| Printed labels | EAN-13 for a valid 13-digit code, Code 128 for anything else |

`Generate barcodes` on a garment's page gives each size with no code an EAN-13 starting `29`, the GS1 range for use inside one organisation.

At a window 780 pixels wide or narrower, a `SCAN` button sits at the bottom right. On `Counter` and `Stock › Count` it opens that screen's camera; anywhere else it opens search with the camera running. Which browsers can use the camera is on [scanning and browsers](/docs/apps/scanning-and-browsers).

## Keys the screens answer to

| Key | Where | Does |
|---|---|---|
| / or Ctrl+K (Cmd+K on a Mac) | Any portal screen, outside a field or dialog | Opens search |
| Up and Down arrows, Enter | Search panel | Move through results; open the highlighted one |
| Shift+Enter | Search panel, on a person | Opens their record instead of `Counter` |
| Escape | Search panel, any dialog | Closes it |
| Tab, Shift+Tab | Search panel, any dialog | Moves round its controls without leaving it |
| Escape | `Counter`, with a person chosen | Changes person, unless the pickup has lines or a match list is open |
| Ctrl+Enter (Cmd+Enter) | `Counter`, `Issue` mode | Records the issue |
| Down arrow | `Counter` scan box, `Manager` search | Moves to the first match |
| Alt+Left, Alt+Right | `Settings › Issuing rules`, a group's menu button | Moves the group one route back; one route on |
| Enter, Escape | Renaming a group | Saves; cancels |
| Enter | `New group name`, `New supplier`, `Add a size`, a size's barcode field | Adds or saves |

## Keys in this manual

The manual has its own keys, on the website at `/docs` and in the app at `/app/help`.

| Key | Where | Does |
|---|---|---|
| / | A manual page, when you are not typing in a field | Puts the cursor in the manual's search box |
| Up and Down arrows | The search results | Move between results |
| Enter | The search results | Opens the highlighted page |
| Escape | The search box | Closes the results |

Manual pages also carry `Print` and `Copy link` buttons.

## Printing

Printing uses the browser's own print dialog. Two routes lead there.

- **A print page** opens the dialog after half a second and keeps a `Print` button for another try. The order form (`Order form` on `Counter`, `Print order form` on a request, `Print the form` on a person's `History` tab), the supplier order sheet (`Print` after ordering, `Order sheet` on an order) and labels (`Print labels (N)` in a garment page's menu) open in a new tab. Collection and delivery slips open in a pop-up window: `Collection slip` on `Counter`, `Slip` under `Call to collect` on `Today`, and `Collection slip` or `Delivery slip` on a request.
- **A print window** carries the document itself: `Print` on each `Reports` panel, `Month-end pack`, `Sheet` on a supplier's `To order` panel, `Print order` on an order, `Print count sheet` on `Stock › Count`, `Credit slip`, and the hand-in `Receipt`. If the browser blocks it, ThreadCount says `Pop-up blocked — allow pop-ups for ThreadCount to print.`

The label sheet holds 6 labels to an A4 page. From a garment's page it prints one label per garment on hand for each size with a code, after you confirm the number. From the counter app, a stock line's `Print a label` prints 1 to 20 copies of that size's label, 1 unless changed.

The Android counter app prints labels through Android's print dialog from version 1.5; see [the counter app](/docs/apps/counter-app). Any other print page opened inside the app says `This app can't print. Open this page in a browser — on the computer at the counter — to print it.`
