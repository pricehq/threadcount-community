---
title: Cost centres
section: reports
order: 2
summary: How an issue reaches a cost centre, why each issue keeps the price of the day it went out, and what moving a person between wards does to the reports.
screen: Settings › Places & cost centres
role: Admin
keywords: cost centre, cost center, department, ward, override, price, unit cost, re-price, valuation, move staff, transfer, unallocated, places
---

## Where the cost centre comes from

A cost centre belongs to a department or ward, and a person belongs to a ward. When the reports group an issue, they look up the person it was issued to and use, in this order:

1. **Their cost centre override**, if one is set on their record.
2. **Their ward's cost centre**, from `Settings › Places & cost centres`.

If neither gives a code, the issue shows under an em dash in `Reports › Spend › By cost centre` and under `UNALLOCATED` on the journal. Finance cannot post that line, so the Journal panel is marked; see [Journal export](/docs/reports/journal-export).

## Setting departments and codes

`Settings › Places & cost centres` has a `Departments & cost centres` table with the columns `Department / ward`, `Cost centre` and `Staff`. An Admin edits the name and the code in place, and each change saves as you type; for an Issuer the boxes are disabled. To add one, enter a name such as `Ward 4A` under `New department / ward` and a code such as `RGH-4010` under `Cost centre`, then press `Add`. The button stays disabled until both are filled.

- A name already on the list is refused, whatever its capitals, including when you rename a department to it.
- Renaming a department moves its staff and any orders filed under the old name to the new name.
- A department with staff on it cannot be removed; the `×` only appears when its `Staff` count is 0.
- Two departments may share a code. The journal then gives them one line.
- `Export CSV` downloads the table.

The same section links to `Stock › Locations`, where rooms, shelves and bays are kept.

## The override on a record

Open the person under `People`, then `Details & access`. The `Cost centre` row shows the code in use followed by `override` or `from ward`. An Admin presses `Edit details` and picks from `Cost centre override`, which lists the codes already on your departments, or `None (from ward)`. See [Staff register](/docs/people/staff-register).

## The price on the day

When a garment is issued, the issue stores the garment's catalogue cost at that moment as its unit cost. This holds at the counter, when a picked request is handed over, on a pickup, and when a delivery goes straight to the person who ordered it. An issue from the pre-loved pool stores $0.

In an exchange, the garment that came back keeps its original unit cost, and the replacement stores the catalogue cost on the day of the exchange. If the original came from the pre-loved pool, the replacement is pre-loved too and stores $0. A partial return splits the row, and both halves keep the unit cost. See [Exchanges and returns](/docs/counter/exchanges-and-returns).

Every issued figure on `Reports` is quantity times that stored unit cost. An issue with no stored cost falls back to today's catalogue cost.

## Why nothing is re-priced

Changing a garment's cost in the catalogue records the old and new cost with your name. It does not touch any issue, so a journal finance has already posted totals the same after a supplier raises its prices.

Three figures are not price-on-the-day. Valuation and Shrinkage on `Reports › Stock`, and value saved on `Reports › People › Pre-loved`, use the current catalogue cost, so they move when a cost changes.

## Moving a person between wards

The cost centre is not stored on the issue. The reports work it out from the person's record each time the screen draws. When you change a person's ward or override, every issue they have ever had moves to the new cost centre, including months already closed. Changing a department's code moves the issues of everyone on it who has no cost centre override.

> **Careful** Changing a ward, an override or a department's code re-files that history in every month, so a reprinted journal for a posted month will no longer match what finance posted.

If a person transfers at month end, print the month-end pack and export the journal first, then change the record. Unit costs stay as they were.

| Record | Change | Undo |
|---|---|---|
| Department | Name and cost centre; a rename also renames it on staff and orders | Edit the boxes back |
| Staff record | Ward and cost centre override | Edit the record back |
| Catalogue cost | New cost and a cost change entry; issues untouched | Enter the old cost |
