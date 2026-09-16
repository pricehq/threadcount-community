---
title: ThreadCount in one page
section: start
order: 1
summary: What ThreadCount records, the screens in the menu, the search and scan bar, who signs in, and where to find each first-month task.
role: Anyone
keywords: overview, introduction, menu, screens, today, counter, stock, orders, people, search, scan, what is threadcount, getting started, help, manual, docs
---

## What it records

ThreadCount records uniform stock for one facility and keeps three things in step.

- **Who holds what.** Every garment issued, returned, swapped or handed in is written against a person on the staff register, so each person's holding is always current.
- **The shelf, by size.** Each garment in the catalogue has sizes, and each size has its own on-hand figure, reorder level and supplier code. Issues take stock off the shelf. Deliveries and stock counts put it back or correct it.
- **What to order.** Sizes at or below their reorder level are gathered on `Orders` into one panel per supplier, raised as orders, and received against when the delivery arrives.

All three come from the same records. A garment issued at the counter changes the person's holding and the shelf figure. If the size drops to its reorder level, it appears under `To order`.

## The menu

The menu down the left side lists the screens in this order.

| Screen | What it is for |
|---|---|
| `Today` | The queue: the setup checklist, bags to call people about, the delivery round, approved requests to pick, deliveries due and counts due, with the month-end steps beside it. |
| `Counter` | Find the person first, then `Issue`, `Return`, `Hand in` or `Swap a size`. |
| `Stock` | Three tabs: `On hand`, `Count` and `Locations`. Each garment has its own page. |
| `Orders` | `To order` by supplier, `On the way`, and the ledger of all orders. |
| `People` | The staff register and each person's record, with the tabs `Uniform`, `Requests`, `History` and `Details & access`. |
| `Reports` | Three tabs, `Spend`, `Stock` and `People`, under the month-end steps. |
| `Settings` | Facility, Issuing rules, Catalogue & suppliers, Places & cost centres, People & sign-in, Data & audit log, and Plan. |

Some screens are not on the menu. `Delivery rounds` lights `Today`. The full request queue is opened with the `Requests` button on `People`, and lights `People`. The audit log is at the foot of `Settings › Data & audit log`. Your name and role are at the foot of the menu, with `Sign out`.

On a narrow screen the bar along the bottom holds `Today`, `Counter`, `Stock` and `More`. `More` holds Orders, People, Requests, Delivery rounds, Reports, Settings, Help and Counter app. A `SCAN` button opens the camera.

## Search and scan

The bar across the top reads `Search or scan: a person, a garment, an order`. Press `/`, or Ctrl+K (⌘K on a Mac), to open it from anywhere except a field or a dialog.

- **A person.** Type a name or staff number. Enter opens them at the counter, and Shift+Enter opens their record.
- **A garment.** Type a name or SKU to open its page on `Stock`, or type its barcode and press Enter.
- **An order.** Type the order code, the supplier's reference, the invoice number or the supplier.

A barcode scanner works without opening the bar. Scanning a staff number opens that person at the counter. Scanning a garment adds it to the pickup when the counter has a person open, counts it on `Stock › Count`, and otherwise opens the garment's page.

## Who signs in

The people who run the linen room sign in as users, and each user has one of two roles.

- **Admin** sets the facility up and makes the changes that affect everyone: the catalogue, reorder levels, the staff register, users, and raising the `To order` list with suppliers.
- **Issuer** works the counter: issues, returns, requests, stock counts and receiving deliveries.

The person who creates the facility is its first Admin. Staff who wear the uniform are not users. They sign in to the staff app with a separate account that shows their own record and the requests they are part of. [The two roles](/docs/start/the-two-roles) sets out what each can do.

## Where the manual lives

The same pages appear in three places.

- On the website, under `/docs`.
- In the app, under `Help`. Every screen has a `?` beside its title that opens the page about that screen. On a phone, `Help` is also in the `More` sheet.
- In the Community edition's source repository, `pricehq/threadcount-community`, in the `docs/manual` folder.

## How do I…

| Task | Page |
|---|---|
| Load the staff register and catalogue from a spreadsheet | [CSV templates](/docs/reference/csv-templates) |
| Issue a garment at the counter | [Issue a garment](/docs/counter/issue-a-garment) |
| Set the level at which a size is reordered | [Reorder levels](/docs/stock/reorder-levels) |
| Count the shelf | [Stocktakes](/docs/stock/stocktakes) |
| Order from a supplier | [Your first order](/docs/start/your-first-order) |
| Book in a delivery that arrived short | [Receiving and back orders](/docs/stock/receiving-and-back-orders) |
| Give a colleague a login | [Users](/docs/account/users) |
| Get staff onto the staff app | [Staff app](/docs/apps/staff-app) |
| Close off the month for finance | [Month-end pack](/docs/reports/month-end-pack) |
| Take a backup of everything | [Export and backup](/docs/account/export-and-backup) |
