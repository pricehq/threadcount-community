---
title: Spend, Stock and People reports
section: reports
order: 1
summary: The three Reports tabs, the month-end strip, what each panel counts and leaves out, the period it covers, and how to print or export it.
screen: Reports
role: Admin or Issuer
keywords: reports, spend, stock, people, finance, cost centre, journal, top stock, valuation, shrinkage, exceptions, supplier spend, approvals outstanding, pre-loved, month, month-end, print, CSV, export
---

## How the screen works

`Reports` has a month select (`Reporting month`), `Export CSV` and `Month-end pack` in its header. Below them sit the month-end strip and three tabs: `Spend`, `Stock` and `People`. The select lists the current month, every month with an issue or an order in it, and the 5 months before the one chosen. Every panel reads the chosen month, except Valuation, Approvals outstanding and the `Pool today` part of Pre-loved, which describe today.

`Export CSV` in the header downloads the main export of the tab you are on: the monthly report on Spend (cost centres, staff groups, staff, suppliers and the financial year in one file), Valuation on Stock, and Exceptions on People. Most panels carry their own `CSV` and `Print`. `Print` opens an A4 page in a new window, headed with the facility, location, today's date and the coordinator.

Old report links such as `?tab=journal` still open the tab that now holds that report.

## The month-end strip

The strip has four steps for the chosen month:

1. **Deliveries booked in.** `All in`, or the number overdue, linked to `Orders › All orders`.
2. **Stock take filed.** The date of the latest stocktake filed in the month, or `Not yet` with `Start`, which opens `Stock › Count`. Counts of the pre-loved pool do not count.
3. **Journal.** `Ready after the count` until a stocktake is filed, then the number of issues with no cost centre, or `Ready`.
4. **Month-end pack.** Prints the pack; see [Month-end pack](/docs/reports/month-end-pack).

## The panels at a glance

| Panel (tab) | A row is | Period |
|---|---|---|
| By cost centre, By staff group, By staff member (Spend) | A cost centre and team, a group, a person | Month |
| Journal (Spend) | One cost-centre code | Month |
| Financial year (Spend) | A month | 1 July to the end of the month |
| Valuation (Stock) | A garment with stock on hand | Today |
| Shrinkage (Stock) | A filed stocktake | Financial year to the end of the month |
| Top stock (Stock) | A garment, top 15 | Month, and the financial year |
| Supplier spend (Stock) | A supplier | Month |
| Exceptions, Pre-loved (People) | A flagged person; a pool issue or hand-in | Month |
| Approvals outstanding (People) | An approval with sets remaining | Today |

## What counts as issued

An issue counts when its date falls in the month and the garment has not come back as `Returned - Good`. A garment returned in any other condition still counts. Issues from the pre-loved pool are left out of every issued figure and reported only on Pre-loved.

Every year-to-date figure stops at the end of the chosen month, so a closed month reprints with the figures it first had. Each issue is valued at the unit cost stored on it when it went out; see [Cost centres](/docs/reports/cost-centres).

## Spend

Three figures head the tab: `Issued value` against the month before, `Garments issued` with how many were pre-loved, and `Ordered from suppliers` with the number of orders. Below them sit `By cost centre`, `By staff group`, `By staff member` and `Issued value · last 6 months`, whose bars change the month. A row in `By cost centre` opens the issues behind it. `Journal` and `Financial year` close the tab; see [Journal export](/docs/reports/journal-export).

## Stock

Valuation counts units on hand for every garment and size today, at the current catalogue cost. Garments with no units are left out, and a negative size counts as 0; the panel says how many sizes are negative. The pre-loved pool is not in it.

Shrinkage lists every stocktake filed from 1 July to the end of the month, with lines counted, variances, net units and net value at current catalogue cost. See [Stocktakes](/docs/stock/stocktakes).

Top stock ranks the 15 garments with the most items issued in the month. Supplier spend totals orders dated in the month that were placed; drafts, cancelled orders and back orders are left out. A delivered line is valued at its receipt cost, an undelivered line at catalogue cost.

## People

Exceptions names a person who, in the month, was issued garments on an override past the sets ceiling, outside their staff group or not in their uniform style, or whose items reach `Exception threshold (items/month)` in `Settings › Facility`. The threshold is 10 when blank or 0; the ceiling is `Most anyone holds` in `Settings › Issuing rules`. Override rows come first. `Items (FY)` is a tally, and nobody is flagged on it; see [The entitlement rule](/docs/people/entitlement-rule).

Approvals outstanding lists every manager's approval with sets not yet collected. Pre-loved lists pool issues with value saved at catalogue cost, hand-ins split into good and rag, and the pool today at $0.

The line `Yearly figure for reports` shows garments per person, and an Admin changes it with `Change`. The counter does not refuse on it.
