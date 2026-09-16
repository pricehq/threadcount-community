---
title: Reorder levels
section: stock
order: 3
summary: A reorder level per size or the facility default, when a size is flagged, where the flags show, and how the forecast suggests a level.
screen: Stock › a garment
role: Admin
keywords: reorder level, par, minimum, low stock, at reorder, out of stock, flagged, replenishment, forecast, suggested reorder, lead time, weeks of cover, runs out
---

## Where a level comes from

Every size has a reorder level. It is the size's own figure if one has been set, and the facility default otherwise. The default is `Default reorder level` under `Settings › Catalogue & suppliers`, which starts at `3`.

An Admin sets a size's own level in any of these places:

- The **−** and **+** stepper in the `Reorder at` column of the `Sizes` panel, on the garment's page.
- **Set reorder** on the bulk bar of `Stock › On hand`, which sets one level on every size of the ticked garments.
- **Use** beside a forecast suggestion in the garment page's `Ordering` panel (below).
- The Reorder levels template in `Settings › Data & audit log`, or the optional `reorder` column of Opening balances. See [CSV templates](/docs/reference/csv-templates).
- **Duplicate** copies a garment's levels to the copy.

A level can't go below 0. Once a size has its own level, no screen returns it to the default; set it to the default figure instead. An Issuer sees the levels but can't change them.

## When a size is flagged

A size is at reorder when what is on hand is at or below its level. A size is left out while nothing has ever happened to it: no opening stock, no adjustment, no level of its own and no movement. Discontinued garments are never flagged.

The same rule drives every place a flag shows:

- `Stock › On hand`: the `At reorder` segment and its count, a low or out mark on the size in the strip, and a `N low` or `N out` tag on the garment.
- The garment page: `Reorder` or `Out` in each size's `Status`.
- The rail: the `Stock` badge counts garments with any size at reorder.
- `Today`: the `Runs out before a delivery` panel lists sizes at reorder that are out, or forecast to run out before a delivery, 6 at most.
- `Orders`: the To order list, where they become lines to order. See [the To order list](/docs/stock/order-list).

On the phone, `Stock › Draft order` lists the sizes at or below their reorder level that no open order already covers, each with a quantity you can change and its supplier. `Raise the draft` makes one order per supplier and shows `Draft <code> raised`. When every short size is on an open order the screen reads `Already on order`. Committing a count on the phone returns to `Today` and drafts no order itself.

## The forecast's suggested level

The garment page's `Ordering` panel shows, for each size, a usage figure and a suggested level. It is worked out from issues already recorded:

1. **Usage.** Garments of that size issued in the last 13 weeks, averaged per week. If none were issued in 13 weeks, the last 26 are used. Pre-loved issues are not counted.
2. **Lead time.** The supplier's lead time in days divided by 7, or 2 weeks when none is set.
3. **Suggested level.** Weekly usage × (lead time in weeks + 2), rounded up.

The figure reads like `Suggested 12 · 3.1 wk cover · ~4/wk`: the suggestion, how many weeks the shelf lasts at that rate, and the weekly rate. With no issues in 26 weeks it reads `no usage yet` and nothing is suggested.

A `runs out before delivery` tag appears when the weeks of cover are fewer than the lead time. On the To order list the same size reads `runs out before this arrives`, which is also shown for a size that is out and has any usage.

A suggestion writes nothing. **Use** appears when the suggestion differs from the current level, and sets it.

> **In plain terms** The suggestion covers the lead time plus 2 weeks at the recent rate of issue.

## What is written

| Action | Record · Change | Undo |
|---|---|---|
| − / +, Use | That size's reorder level | Set it again |
| Set reorder (bulk) | The level on every size of each ticked garment | Set it again per size |
| Default reorder level | Facility setting, read by every size without its own | Change it back |
| A flag or a suggestion | Nothing; both are worked out on screen | Nothing to undo |
