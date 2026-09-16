---
title: Stocktakes
section: stock
order: 4
summary: Counting the shelf or a location at the desk or on a phone, blind counts, variance in garments and dollars, the reasons a large gap needs, and what filing writes.
screen: Stock › Count
role: Admin or Issuer
keywords: stocktake, stock take, count, audit, stock count, blind count, variance, shrinkage, count sheet, reason, missing, condemned, laundry, file count, apply adjustments, location, shelf, pre-loved
---

## Counting at the desk

`Stock › Count` lists every size of every current garment with the figure ThreadCount holds (`System`) and a `Counted` box.

1. **Set the scope.** `Filter garments` by name, SKU, size or barcode, pick a `Group`, or pick a `Location` to count only the sizes placed there and inside it. `Show › Uncounted` hides lines already counted.
2. **Count.** Each scan into `Scan to count +1` adds 1 to its line; **Camera** does the same. Or type the figure into `Counted`.
3. **Watch the progress.** The bar reads `N% counted · N of N`, and the line below gives the variances, their dollar value and how many need a reason.
4. **Zero uncounted** sets every uncounted line in the scope to 0, for a count where the rest of the shelf is empty.

The tally is kept in this browser for the signed-in person until it is filed or cleared, and `Saved tally · last entry` says when it was last touched. **Clear counts** starts again. A code that matches nothing opens the [unknown barcode](/docs/stock/barcodes) dialog. A code for a size outside the chosen location is not counted.

`Pool › Shelf` counts stock on hand. `Pool › Pre-loved` counts the pool of handed-in garments instead, carried at nil value. The screen can be reached from `Today`, where `Counts due` lists locations never counted or last counted 30 or more days ago.

## Blind counts and the count sheet

`Mode › Blind` hides the `System` figures and the variance and dollar figures, so the counter can't see the expected number. A counted line shows a tick under `Counted?`. A line that needs a reason still asks for one.

**Print count sheet** prints the lines in scope, grouped by garment, with the size, the bound barcode, the system figure and an empty box. In blind mode the system figure is left off and the sheet is marked `BLIND COUNT`.

## Variance and reasons

A line's variance is counted less system. The dollar figure is each variance times the garment's unit cost, added up; in the pre-loved pool it is nil.

A gap as large as `Settings › Issuing rules › A count gap needs a reason at` or larger, over or short, must carry a reason: `At laundry`, `Condemned`, `Missing` or `Other`. The setting starts at `5` and is never treated as less than 1. Lines still owing a reason are kept at the top of the list whatever the filter hides, and the file button stays off until each has one. The server refuses the whole count if one arrives without.

## Filing the count

The button reads **File count** when every counted line matched and **Apply adjustments** when some didn't. Issuers can file a count as well as Admins.

- Only counted lines are sent. Uncounted lines are left as they are.
- Every counted line is filed, matching or not, so each size's `Last counted` date on the garment page is right.
- Each variance moves stock on hand by the difference. In the pre-loved pool, the pool is set to the counted figure.
- The system figure is read again on the server when the count is filed.
- A count scoped to a location files with that location, and is refused if a line is not placed under it.

`Stocktake history`, below, lists filed counts newest first: date, who counted, pool, location, lines, variances, and the net change in garments and dollars. **Variances** shows each gap with its reason; **CSV** downloads that count's variance lines with unit cost and variance value.

## Counting on a phone

In the [counter app](/docs/apps/counter-app), the count lists every location with garments placed on it, plus `Not on a shelf yet`. Sizes are placed from the garment's page, and locations are made in `Stock › Locations`.

1. **Scan the shelf label**, or pick the location from `Stock › Count a shelf`. Each line shows counted against expected.
2. **Scan.** Each scan adds 1. A code placed on another shelf is refused with that shelf's name. **Undo** takes 1 off the current line; **Type a count** is for a label that won't scan; **Hands-free** keeps the camera reading.
3. **Finish.** `Check the gaps` lists lines that don't match, with **Recount** and the reasons: `At laundry`, `Condemned`, `Missing` or `Other` for a short line, `Found extra` or `Other` for an over line.
4. **Commit count.**

The counter app also charts each size's gap across the last 6 shelf counts.

> **Careful** A phone commit files every line on that location, and a line nobody scanned is filed as 0.

## What is written

| Action | Record · Change | Undo |
|---|---|---|
| Counting (desk or phone) | Nothing on the server; the tally is kept on the device | Clear counts |
| File count / Apply adjustments / Commit count | A stocktake: date, who, lines counted, variances, shelf or pool, location if scoped; a line per counted size with system, counted and reason | No undo; a filed count stays in history |
| A variance on the shelf | Stock on hand moved by the difference | Count again, or Adjust quantity (Admin) |
| A variance in the pool | The pre-loved pool set to the counted figure | Count again, or Adjust quantity › Pre-loved |
