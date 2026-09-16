---
title: The staff register
section: people
order: 1
summary: The People screen: what a record holds, how to add, import, filter and export the register, and what each tab of a person's record shows.
screen: People
role: Admin
keywords: staff register, people, add a person, import, roster, csv, payroll number, staff number, sizes, fte, uniform style, missing, approver, export, record, details and access
---

## What a record holds

Each person on the register is one record. `Add a person` at the top of `People` opens the `Add staff member` form. Only an Admin sees it.

| Field | Notes |
|---|---|
| `Staff number` | Required and unique in the facility. It cannot be changed after the record is saved, because issue history and reports are keyed to it. |
| `First name`, `Last name` | Both required. |
| `Phone`, `Staff group`, `Department` | The group decides the person's route (see [groups and routes](/docs/people/groups-and-routes)). The department is their ward and decides the cost centre unless an override is set. |
| `Top size`, `Pants size` | One of each. |
| `Uniform style` | `Men's`, `Women's`, `Either`, or not set. Not set offers every style, as `Either` does. |
| `Combined FTE` | `1.0` down to `0.1`, or `Casual`. Only read for groups on the FTE table. |
| `Yearly report figure (garments)` | Used by reports only; the counter never refuses on it. Groups on the FTE table are not measured. |
| `Cost centre override`, `Start date`, `Notes` | Optional. |

The manager and `On the ward desk` are set on the record's `Details & access` tab. Past the plan's staff limit, a new record is refused with `The register is full for this plan`.

## Import from a spreadsheet

`Import the register` opens `Settings › Data & audit log` with the `Staff register` import chosen. Its columns are `num,first,last,phone,group,dept,cc,manager,fte,style,top,pants,ccoverride,ent,start,notes`.

- A row with no `num` or no `first` is skipped.
- A row whose staff number is already on the register updates that record. Only cells with something in them are written; a blank cell keeps what is there.
- `dept` with `cc` creates the department if it does not exist.
- `manager` is the manager's staff number, not their name. Managers are linked after every row is in, so a manager can appear anywhere in the file. A number that matches nobody is reported.
- An `fte`, `start` or `style` cell that cannot be read is reported and left blank. Dates are written `YYYY-MM-DD`.
- At most 20,000 rows at a time. New rows past the plan's staff limit are skipped and the refusal is reported once.

An import adds no group names to `Settings › Issuing rules`. The template is on [CSV templates](/docs/reference/csv-templates).

## Filter and export

The search box, `Name, number or ward`, sits beside a `Group` select and a `Show` select. `Show` offers `Everyone`, `Missing something`, `No approver`, `No FTE`, `No sizes`, `No staff app`, `No uniform style`, `Receipts to sign` and `Over the ceiling`; every option but `Everyone` shows its count in brackets. When anyone is inactive, a segment switches between `Active` and `Include inactive`.

`Missing something` counts only gaps that stop something working: no approver (none, or one no longer active), no FTE (FTE-table groups only) and no sizes. Inactive records have no gaps.

The line under the filters counts the whole active register, whatever the search. Each row's `Status` is `OK`, `AT LIMIT` (a full half of a set), `OVER` or `Inactive`, and `Missing` names the gaps.

`Export CSV` downloads the rows on screen. The staff import reads its headers back, so a ward's list can go to its manager, come back with `Manager number` filled in, and be imported again. `Approver name (reference only)` is ignored on import. Notes and start dates are left out of the file.

`Requests` opens the [request queue](/docs/counter/requests-from-staff).

## A person's record

Click a name to open it. The top shows their details, their manager and meters for tops and pants against the ceiling, with `Open at the counter` and, for an Admin, `Edit details`.

| Tab | What is on it |
|---|---|
| `Uniform` | `Holding`, with a signed or not signed toggle and `Return` on each line. `Waiting for` pickups, the `Approval` panel and the `Note`. |
| `Requests` | Their requests, `Open` or `All`, and `Open in the queue`. |
| `History` | `Issue history`, `Hand-ins`, `Alterations`, `Previous order forms` and the orders placed for them. |
| `Details & access` | `Details`, `Manager`, whose requests they approve, `Staff app`, and the `Register` panel with `Deactivate` and `Delete`. |

An Issuer can read every tab, and can record a signed form, a hand-in or an alteration. Details, the note, the manager, the FTE and staff-app access are Admin only.

## What is written

| Record | Change | Undo |
|---|---|---|
| Add a person | A new staff record. | Delete it while it has no history. |
| `Edit details`, `Combined FTE` select | The fields on the record. The FTE saves as soon as it changes. | Edit again. The staff number cannot change. |
| Import | Records created or updated, managers linked, departments created. | None. Import a corrected file, or edit by hand. |

Every change is listed in the audit log under `Settings › Data & audit log`.
