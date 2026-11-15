---
title: CSV templates
section: reference
order: 1
summary: The six import files, the columns each one reads, how a row is matched to a record, and what every importer message means.
screen: Settings › Data & audit log
role: Admin
keywords: csv, import, template, import the register, data and audit log, spreadsheet, columns, headers, upload, catalogue, staff register, departments, barcodes, reorder levels, opening balances, bulk load
---

## Load order and the basics

Under `Settings › Data & audit log`, in `Import from CSV`, an Admin picks a file kind, presses `Download template` for `threadcount-<kind>-template.csv` (header row plus one example row), fills it in, saves it as CSV and presses `Import CSV`. `Import the register` on `People` opens the same place with the staff register already chosen.

Load in this order, because later files look up what earlier ones created:

1. **Departments & cost centres** (`depts`)
2. **Catalogue** (`catalog`)
3. **Staff register** (`staff`)
4. **Supplier barcodes** (`barcodes`)
5. **Opening balances** (`opening`)
6. **Reorder levels** (`reorder`)

For every file:

- Headers are matched ignoring case, spaces and punctuation, so `Staff no.` reads as `staffno`. Unknown columns are ignored.
- Cells are trimmed and cut at 400 characters. Blank lines are skipped.
- The apostrophe ThreadCount's exports put before `=`, `+`, `-`, `@` or a space is removed, so an exported file imports back unchanged.
- On a re-import a blank cell keeps what the record holds. An import cannot clear a field.

## Departments and catalogue

**Departments & cost centres.** Matched by exact name. The row order becomes the list's order.

| Column | Required | Rule | Example |
|---|---|---|---|
| `dept` | Yes | Also `department`, `name`, `ward`. | `Harbour Ward` |
| `cc` | No | Also `costcentre`, `costcenter`, `code`. Blank keeps the existing one. | `RGH-4010` |

**Catalogue.** Updates the garment with the same `item` and gender, and the same `sku` when given; otherwise creates one.

| Column | Required | Rule | Example |
|---|---|---|---|
| `item` | Yes | Also `name`, `itemname`, `garment`. | `Scrub Top` |
| `gender` | No | Starts `m`: men's. Starts `f` or `w`: women's. Anything else or blank: Unisex. | `Women's` |
| `sku` | No | Also `code`, `productcode`. | `NW-ST-220` |
| `supplier` | No | Also `vendor`. A new name is added to the supplier directory; a known one, in any case, takes the directory's spelling. | `Northline Workwear` |
| `cost` | No | Also `unitcost`, `price`. Non-digits dropped. Blank or 0 keeps the existing cost. | `31.50` |
| `group` | No | Also `staffgroup`. Several separated by a pipe; `All` is every group. Blank: All when new, unchanged on update. | `Midwife` |
| `sizes` | New garments | Also `size`. Separated by a pipe, `,`, `;` or `/`. An update adds new sizes and removes none. | `S/M/L/XL` |
| `notes` | No | Also `note`. | `Navy` |
| `type` | No | Not in the template. Also `producttype`, `garmenttype`. Decides top, trousers or neither. | `Scrub top` |

## Staff register

Updates the person with the same staff number, or creates one. Managers are linked after every row is written, so a manager can sit anywhere in the file. A row without a staff number or first name is skipped.

| Column | Required | Rule | Example |
|---|---|---|---|
| `num` | Yes | Also `staffnumber`, `staffno`, `number`, `payroll`, `payrollnumber`, `id`. | `00400127` |
| `first` | Yes | Also `firstname`, `given`. A `name` or `fullname` column is split at the first space if first and last are blank. | `Amira` |
| `last` | No | Also `lastname`, `surname`, `family`. | `Hassan` |
| `phone` | No | Also `mobile`, `contact`. | `0400 000 000` |
| `group` | No | Also `staffgroup`, `classification`. Not checked against `Settings › Issuing rules`. | `Registered Nurse` |
| `dept` | No | Also `department`, `ward`, `wardunit`. | `Harbour Ward` |
| `cc` | No | Also `costcentre`, `costcenter`, `departmentcostcentre`. With `dept`, creates a missing department. Never changes an existing one. | `RGH-4010` |
| `manager` | No | Also `managernum`, `managernumber`, `approver`, `reportsto`. A staff number, not a name. | `00400019` |
| `fte` | No | Also `combinedfte`, `totalcombinedfte`, `totalfte`, `employmentfraction`, `fraction`. Above 0, or `Casual`. | `0.8` |
| `style` | No | Also `uniformstyle`, `uniform`, `cut`, `gender`. `m`, `male`, `men's`: Men's. `f`, `w`, `female`, `women's`, `ladies`: Women's. `either`, `both`, `any`, `all`, `unisex`: Either. | `Women's` |
| `top` | No | Also `topsize`, `shirt`, `shirtsize`. | `M` |
| `pants` | No | Also `pantsize`, `pant`, `trouser`. | `12` |
| `ccoverride` | No | Also `costcentreoverride`. | `RGH-4090` |
| `ent` | No | Also `entitlement`, `annualentitlement`. Whole number for the yearly report; limits nothing. | `10` |
| `start` | No | Also `startdate`, `commenced`. `YYYY-MM-DD`, or day first as `11/03/2024`. | `2026-02-02` |
| `notes` | No | Also `note`. | `Night shift` |

`Export CSV` on `People` writes headers that read back onto these columns. See [the staff register](/docs/people/staff-register) and [managers](/docs/people/managers).

## Barcodes, opening balances, reorder levels

Each row must match exactly one garment on whichever of `sku` (also `code`, `productcode`), `item` (also `name`, `itemname`, `garment`) and `gender` it fills in, then a `size` spelt as on the garment. Blank `gender` matches any. A header named `code` is read as the SKU.

| File | Column | Rule | Example |
|---|---|---|---|
| Supplier barcodes | `barcode` | Also `ean`, `code128`, `scan`. Blank skips the row. | `9300000000017` |
| Opening balances | `opening` | Also `qty`, `quantity`, `onhand`, `count`. Overwrites; blank leaves the size alone. | `14` |
| Opening balances | `reorder` | Optional. Also `reorderat`, `reorderlevel`. Not a number: sets 0. | `4` |
| Reorder levels | `reorder` | Also `reorderat`, `reorderlevel`, `level`. Overwrites; not a whole number skips the row. | `4` |

Negative figures are stored as 0. Every row these files write counts as created. See [barcodes](/docs/stock/barcodes) and [reorder levels](/docs/stock/reorder-levels).

## Messages and what to do

The result reads like `Catalogue: 12 created, 3 updated, 1 skipped.`, then up to 40 row messages. `Row 1` is the first row under the header, blank lines not counted; the two whole-file refusals give the file's line number.

| Message | Meaning | Fix |
|---|---|---|
| `Line N: a quote is opened and never closed…` | Nothing imported. | Fix the quote. |
| `Lines N: the wrong number of columns…` | Nothing imported; usually a stray `"`. | Fix those lines. |
| `No rows found — check the header row.` | Nothing under the header. | Save the right sheet. |
| `Row N: X has no sizes` | New garment skipped. | Add `sizes`. |
| `Row N: start date “X” isn't a date…` | Stored blank. | Write `YYYY-MM-DD`. |
| `Row N: FTE “X” isn't a fraction…` | Stored blank. | Write `0.75` or `Casual`. |
| `Row N: uniform style “X” isn't…` | Stored blank. | Use Men's, Women's or Either. |
| `Row N: no staff member with number X to be the manager` | Not linked. | Add or fix the manager's row. |
| `Row N: no catalogue items match…` or `several…` | Skipped. | Fill in `item` or `gender`. |
| `Row N: size X not on Y` | Skipped. | Match the size's spelling. |
| `Row N: opening “X” isn't a number…` | Size left alone. | Write a whole number. |
| `X is already on Y · size Z…` | Code bound to another size, as a one-code-per-style list does. | One code per size. |
| `X is the generated code for Y…` | Refused. | Use the printed label's code. |

## Limits

- 20,000 rows a file: `Import at most 20,000 rows at a time`.
- 20 imports and backup restores together per person in 10 minutes: `Too many imports — wait a few minutes.`
- Over 60 MB: `Request too large`.
- An Issuer gets `Admin only`.
- Nothing caps how many staff records, garments or issues a facility holds.
