---
title: Month-end pack
section: reports
order: 4
summary: One printed document for finance with the month's summary figures, cost centres, journal and top stock, plus shrinkage, exceptions and approvals when there are any.
screen: Reports
role: Admin or Issuer
keywords: month-end pack, month end, EOM, finance pack, print, PDF, summary, journal, shrinkage, exceptions, approvals, monthly routine, close, month-end steps
---

## What the pack is

`Month-end pack` is a button in the header of `Reports`, and the fourth step of the month-end strip below it. Both print the same A4 document for the month in `Reporting month`, titled `Month-end pack` and the month, for example `Month-end pack — August 2026`. The line under the title gives the facility, the location, today's date and the coordinator.

The pack is print only. The strip's step reads `PDF + journal CSV + valuation`, but pressing it prints the one document and downloads no file. The journal CSV comes from the Journal panel on `Spend`; see [Journal export](/docs/reports/journal-export). Printing writes nothing.

## What it contains

Four sections are always there:

1. **Summary.** The six figures below.
2. **Cost centre summary.** One row per journal line: code, department, items and value, with a `TOTAL` row.
3. **Journal.** One debit per cost centre, headed with the GL account: code, description and debit.
4. **Top stock.** The 10 garments with the most items issued in the month, with quantity and value.

Three sections appear only when they have rows:

- **Shrinkage.** Each stocktake filed from 1 July to the end of the month: date, counted by, variances, net units and net value.
- **Staff exceptions.** Staff, cost centre and the flag, as on `Reports › People › Exceptions`.
- **Uncollected manager's approvals.** Staff, approved by, and remaining sets.

The pack leaves out supplier spend, pre-loved, the totals by staff group and staff member, the financial year table and the valuation line by line. Print those from their panels; see [Spend, Stock and People reports](/docs/reports/the-nine-reports).

## The summary figures

| Figure | Counted as |
|---|---|
| Issued value | Month's issues at the unit cost stored on each |
| Items issued | Items in those issues |
| Supplier orders placed | Value of orders dated in the month, less drafts, cancelled orders and back orders; delivered lines at receipt cost, the rest at catalogue cost |
| Stock on hand value | Units on hand today at current catalogue cost |
| Shrinkage (FY to end of month) | Net stocktake variance at current catalogue cost |
| Stocktakes counted (FY) | Stocktakes filed from 1 July to the end of the month |

Issues exclude garments returned as `Returned - Good` and issues from the pre-loved pool. Stock on hand value and the approvals are always as at today, even when you print a past month.

## Running and printing it

1. **Open `Reports` and pick the month.**
2. **Press `Month-end pack`.** A new window opens with the document and the print dialog.
3. **Print from the dialog.** If nothing opens, allow pop-ups for ThreadCount and press the button again.

A pack for a closed month can be printed again at any time. Issued figures use the unit cost each issue was stored with, and year-to-date figures stop at the end of that month. The cost centre on each line follows each person's record as it is today; see [Cost centres](/docs/reports/cost-centres).

Today always shows a `Month-end` panel for the current month, with `Deliveries booked in`, `Stock take filed` and `Journal ready`. A row of receipts to sign, with a `Chase` link, appears only when receipts are unsigned. Its unallocated link and its `Month-end pack` button both open `Reports`; neither prints.

## A monthly routine

In the first days of the new month, pick last month on `Reports` and work along the strip:

1. **Check `Deliveries booked in`.** Book in anything overdue from `Orders › All orders`.
2. **Check `Stock take filed`.** A stocktake counts in the month it was filed, so file the month's count before the month ends.
3. **Clear `Journal`.** If it shows a number unallocated, press it to jump to the Journal, then set the person's team or cost centre override on their record; see [Staff register](/docs/people/staff-register).
4. **Open the `People` tab of `Reports`.** Read Exceptions, and follow up Approvals outstanding; see [Manager approvals](/docs/counter/manager-approvals).
5. **Print the month-end pack**, then press `Export journal CSV` and send both to finance.
6. **Only then move anyone between teams.** A move re-files that person's past issues.

Because stock on hand value is as at today, print the pack early in the month for a figure close to month end. See [Stocktakes](/docs/stock/stocktakes).
