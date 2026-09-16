---
title: The entitlement rule
section: people
order: 3
summary: Six sets held at any time, for every group, with no financial year. How sets held are counted, how hand-ins make room, and where overrides are recorded.
screen: Settings › Issuing rules
role: Admin or Issuer
keywords: entitlement, six sets, ceiling, most anyone holds, cap, allowance, sets held, over the ceiling, override, hand-in, credit, yearly figure, financial year
---

## The rule

Nobody holds more than the ceiling: 6 sets unless the facility sets its own. It limits what a person holds at any one time, and it is the same for every staff group and every route. There is no financial year in it and nothing resets in July.

A set is one top and one pair of trousers. The ceiling applies to each half, so 6 sets means at most 6 tops and at most 6 pairs. Somebody holding 6 tops and 2 pairs can take another pair, not another top.

Garments that are part of no set, such as fleeces and jackets, have their own ceiling of the same number, counted in garments.

Past the ceiling, the next garment comes only after a hand-in or on a coordinator's override.

## How sets held are counted

A garment's type decides which half it is.

| Half | Types |
|---|---|
| Top | `Shirt`, `Polo`, `Tunic`, `Scrub top`, `Blouse` |
| Trousers | `Pants`, `Trousers`, `Cargo pants`, `Shorts`, `Skort`, `Skirt` |

A garment with no type is judged by its name. A type typed in by hand that is not on the list counts toward no set, so pick from the list.

What a person holds is the total of:

- everything issued to them and not handed in or returned, pre-loved garments included;
- open orders placed for them, less what has already arrived;
- pickups waiting for them at the counter;
- request lines a manager has approved that nobody has collected.

`People`, the person's record and the `Counter` all use this count. The record's meters show tops and pants against the ceiling, with how many are still on order or waiting.

## At the counter

While you build a pickup, the `This pickup` panel says what the person will hold afterwards. A pickup that would take them past either ceiling lists the reason, such as `Past 6 sets — holds 6 tops and 4 pairs`, with the tick `Record as an override`. The server refuses the issue unless the override is ticked, and its refusal says what they hold and how much of it is still to come.

See [issue a garment](/docs/counter/issue-a-garment).

## Where overrides are recorded

- Each issue row that went past the ceiling is stamped as an override, pre-loved rows included. It shows as an `Override` tag in the person's `Holding` list and `Issue history`.
- For garments ordered in, the order's notes say the person is past the ceiling and name the coordinator who recorded the override.
- `People` counts everyone above the ceiling under `Over the ceiling`, and their row's status is `OVER`.
- `Reports › People` lists them under `Exceptions` as `Past 6 sets on an override`.

The stamp is written only when the ceiling was actually passed. Garments outside a person's staff group or uniform style carry their own separate stamps.

## Hand-ins

`Record hand-in` on the person's `History` tab, or `Record a hand-in` in the counter's `Hand in` mode, makes room straight away. Each garment is marked `Good` or `Rag`. Matched issues are marked handed in and stop counting toward what the person holds, whether or not credit is ticked. Where only part of an issue line comes back, the line is split.

- `Good` garments join the pre-loved pool. `Rag` garments are counted for disposal.
- `Credit the good garments back` gives sets back to the manager's approvals, newest first, and credits the yearly figure. Only good garments matched to new issues earn credit; pre-loved garments do not.
- `Record & print receipt` prints the hand-in receipt as well.

Returns and size swaps are on [exchanges and returns](/docs/counter/exchanges-and-returns).

## The facility's own figures

| Field | Where | What it does |
|---|---|---|
| `Most anyone holds` | `Settings › Issuing rules` | The rule on this page. Nought saves as 6. Fractions are rounded down. |
| `Starting kit` | `Settings › Issuing rules` | The first-day kit for groups on the starting kit. |
| `Yearly figure for reports` | `Reports › People` | What a year's drawing is measured against. It never limits the counter. A person's own figure is set on their record; groups on the FTE table are not measured. |

Only an Admin can change these. An Issuer sees them read-only.

## What is written

| Record | Change | Undo |
|---|---|---|
| Issue with override | Issue rows stamped as an override, or a note on the order. | Return or hand in the garment. The stamp stays. |
| Hand-in | A hand-in record, matched issues marked handed in, the pool updated. | None on screen. |
| Credit tick | Approval balances and the yearly figure credited. | None on screen. |
| Change the ceiling | The facility's ceiling. | Set it back. |
