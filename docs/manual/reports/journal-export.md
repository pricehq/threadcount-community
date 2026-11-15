---
title: Journal export
section: reports
order: 3
summary: One debit line per cost centre for the month, its exact CSV layout, where the GL account is set, and how to trace a line back to the issues.
screen: Reports › Spend › Journal
role: Admin or Issuer
keywords: journal, GL, general ledger, account code, finance, debit, CSV, export, posting, month end, reconcile, cost centre, unallocated, spend
---

## What the journal is

The `Journal` panel on `Reports › Spend` turns the month's issues into one debit line per cost-centre code. It starts from the `By cost centre` table, drops cost centres with no items this month, and adds together teams that share a code. Lines are sorted by debit, largest first, and a `TOTAL` row closes the table.

The journal counts what `Issued value` counts: issues dated in the month, less garments returned as `Returned - Good`, less issues from the pre-loved pool, each at the unit cost stored when it was issued. Its total equals `Issued value` for the month. See [Spend, Stock and People reports](/docs/reports/the-nine-reports).

The export has debit lines only. There is no credit line and no date column.

## The columns

Press `Export journal CSV` on the Journal panel. The `Export CSV` button in the page header downloads the whole monthly report instead. The journal file is `threadcount-journal-YYYY-MM.csv`, for example `threadcount-journal-2026-08.csv`.

| Column | Holds |
|---|---|
| Cost Centre | The code, or `UNALLOCATED` |
| Department | The team name; several are joined with ` / ` |
| GL Account | The GL account from Settings, the same on every line |
| Description | The description prefix, a space, then the month |
| Items | Items issued, a whole number |
| Debit | The value to 2 decimal places, with no dollar sign or commas |

The first row is the header and the last is `TOTAL`, with the item count, the debit total and the middle columns blank:

```
"Cost Centre","Department","GL Account","Description","Items","Debit"
"RGH-4010","Ward 4A","631020","Uniform issues August 2026",42,"1386.00"
"RGH-5090","Ward 5C / Theatres","631020","Uniform issues August 2026",17,"602.50"
"TOTAL","","","",59,"1988.50"
```

Text is wrapped in double quotes, and so is the debit. Text that begins with a space, `=`, `+`, `-` or `@` gets a leading apostrophe, so a spreadsheet does not read it as a formula. The file is UTF-8 with a byte-order mark.

## The GL account and description

An Admin sets both under `Settings › Facility`, in `Finance & reports`:

- `GL account`, up to 40 characters. While it is blank, the journal shows `—` in its place.
- `Journal description prefix`, up to 120 characters. While it is blank, the journal uses `Uniform issues`.

The month follows the prefix as a full month name and year, so `Uniform issues` becomes `Uniform issues August 2026`. There is one GL account per facility, and the Journal panel's head shows it after `GL`.

## Choosing the period

The journal covers one calendar month, the one in `Reporting month` at the top of `Reports`. There is no custom date range. An issue belongs to the month of its date, which is the day in the facility's `Time zone`, under `Settings › Facility`, when it was recorded.

`Print` on the Journal panel prints the same table on A4, headed `End-of-month journal` and the month.

## UNALLOCATED lines

An issue to someone with no cost centre override, whose team has no code, lands on `UNALLOCATED`. The Journal panel is then marked with the footer `UNALLOCATED = no cost centre`. Once a stocktake has been filed that month, step 3 of the month-end strip shows how many issues are affected, and pressing that number scrolls to the Journal. Until then the step reads `Ready after the count`. Set the person's team or override on their record, and the line moves to the right code the next time the screen draws. See [Cost centres](/docs/reports/cost-centres).

## Reconciling a line

1. **Pick the month and open `Spend`.**
2. **Press the cost-centre code on the Journal line.** A dialog titled `Issues behind` the code and the month lists the issues: date, staff, item, size, quantity, unit cost and value, with a total that equals the line's debit.
3. **Press `Export CSV` in the dialog** to give finance the detail. The file is named like `threadcount-cost-centre-rgh-4010-2026-08.csv`. Its first line names the cost centre and the month, then come the columns `Date, Staff, Item, Size, Qty, Unit cost, Value` and a `TOTAL` row.

The detail is recounted from the same issues as the line, so the two agree. Both follow each person's cost centre as it is now, not as it was in that month.

> **Careful** Moving a person to another team re-files their past issues, so export the journal before you change anyone's team at month end.
