---
title: Plan and billing
section: account
order: 4
summary: The hosted plans and prices, the trial, paying by card or invoice, grace and read-only, and every billing email.
screen: Settings › Plan
role: Admin
keywords: plan, billing, price, pricing, trial, subscribe, card, invoice, receipt, tax, GST, ABN, monthly, yearly, cancel, stop, read-only, grace, grandfathered, health service, purchase order
---

## Plans and prices

Prices are in Australian dollars before tax, from `PRICES` and `PLANS` in `lib/plan.ts`.

| Plan | Price | Staff records | Backups kept |
|---|---|---|---|
| Hosted Small | Free | 60 | 14 days |
| Hosted Facility | $129 a month or $1,290 a year | No ceiling | 35 days |
| Health Service | $4,990 a year for 5 facilities, $890 each extra | No ceiling | 35 days |

On Hosted Small the 60 counts every staff record, deactivated ones included. Past it, adding a person is refused with `The register is full for this plan — 60 staff records.`

A facility inside a health service takes that plan, shows a `Health service` row, and is invoiced yearly against the health service's purchase order.

A facility created before plans went live is grandfathered. Its status reads `Free · everything included, for good`, and there is nothing to buy.

`Plan` is the last item in the `Settings` side list. It is listed for admins only, and not in the demo. The Community edition has no plans.

## The trial

When you create a facility, choose Hosted Small, or a 30-day Hosted Facility trial. Neither takes a card. During the trial the status reads `Trial` with the days left.

## Pay by invoice or card

`Request an invoice` sends ThreadCount a notice naming your facility and the plan chosen: `Hosted Facility · annual` or `Health Service · annual`. ThreadCount raises the invoice to the `Billing contact` and records the payment. You can ask up to 3 times a day. A renewal is requested the same way.

`Subscribe by card` appears only when card payments are set up on the server, and not while the plan is paid. It opens `Subscribe`, a page in four steps for Hosted Facility:

1. **Plan.** Monthly $129 or yearly $1,290.
2. **Business.** Legal name, address, city and country are required, and so is the postcode, except in Ireland, Hong Kong, the United Arab Emirates and Macao. Tax ID is optional. `Billing email` is your billing contact and cannot be edited here.
3. **Agreements.** Tick the Terms of Service, Privacy Policy and Service Level Agreement. The time of the ticks is recorded.
4. **Card.** Press `Continue to card`, type the card into Stripe's fields on the page, then `Pay`. The total includes tax, which Stripe works out from the country and address. Card numbers never pass through ThreadCount.

Paying during a trial charges that day, and the paid period starts then. The Plan screen shows the plan as paid once Stripe confirms the payment.

## The Plan screen

The `Plan` table shows `Status`, `Staff records` (such as `42 of 60`), `Backups`, the end date (`Trial ends`, `Paid until` or `Writable until`), `Paid by`, `Invoiced to` and `Billing contact`. `Save contact` changes the billing contact.

A facility that pays by card also gets `Billing`, with `Card on file`, `Next charge` and `Cadence`, and `Invoices`, each with a PDF link.

- **`Update card`** takes a new card on the same page. It is used for every later charge, and any unpaid invoice is charged straight away.
- **`Stop at period end`**, then **`Yes, stop it`**, stops the renewal at the end of the paid period. Nothing more is charged, and nothing is refunded. `Keep my plan` undoes it before that date.

| Record | Change | Undo |
|---|---|---|
| Facility | Billing contact | `Save contact` again |
| Facility | Business details and agreement times | Subscribe again |
| Card plan | Card replaced | `Update card` |
| Card plan | Set to stop at period end | `Keep my plan` |

## Grace, then read-only

When a trial or a paid period ends unpaid, 14 days of grace follow. The status reads `Ended · still writable`, with `Writable until`.

After grace the facility is read-only. Changes are refused with `Read-only: this facility's plan has lapsed.` Nothing is deleted. A failed card payment changes nothing until 14 days after `Paid until`.

Still working when read-only:

- signing in, reports, CSV exports, printing and the backup download;
- the billing contact and `Request an invoice`;
- your own name and password, and deleting your account.

Restoring a backup is refused. Writing starts again when a payment is recorded.

## Billing emails

These go to the billing contact, or to every active admin if none is set.

| Email | Sent |
|---|---|
| Trial started | When the facility is created on a trial |
| Five trial notes | On days 1, 3, 7, 21 and 28 of the trial |
| Days left on your trial | Once in the last 7 days, then the day before |
| Trial ended | The day the trial ends |
| Now read-only | The day grace runs out |
| Receipt | Each card payment above zero |
| Payment did not go through | A card payment fails, once a day at most |
| Card updated | A new card is saved |
| Plan will end, or has ended | A card plan is set to stop, and when it ends |

These trial and read-only emails are checked daily and sent once each. Facilities paying by card, grandfathered ones and health-service members do not get them.
