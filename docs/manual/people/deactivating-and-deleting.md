---
title: Deactivating and deleting
section: people
order: 5
summary: Deactivate someone who has left and keep their history, delete only a record entered by mistake, remove staff-app access, and handle a privacy request.
screen: People › a person › Details & access
role: Admin
keywords: deactivate, inactive, leaver, left, delete staff, remove, reactivate, history, finance, remove access, staff app account, register panel, privacy, personal information
---

## Deactivate or delete

Someone who has left is deactivated. Their record stays, and so does everything recorded against it.

Delete removes the record itself. It is for a record entered by mistake, and it is refused for anyone with history.

Both are in the `Register` panel on the person's `Details & access` tab, which only an Admin sees.

## Deactivate

`Deactivate` is refused while anyone else still active names them as manager, and the refusal says how many. Give those people a new manager first. Somebody who is only their own manager is not held up by this.

When it goes through:

- Every request for them still waiting on approval is closed as declined, with the reason that they are no longer on the register and a timeline entry. The panel says how many were closed. Nobody is emailed about it.
- The counter refuses to issue to them, and they drop out of the counter's `Find a person` list.
- A request cannot be raised for them at the counter or in the staff app.
- Their staff-app sign-in is refused with `You're no longer on the register at this facility. Ask the uniform store.`
- An emailed approval link about them, or sent to them as a manager, shows no details and decides nothing.
- They leave the `People` counts and the `Show` filter's lists, and are hidden unless `Include inactive` is chosen.

`Reactivate` puts them back. Requests closed at deactivation stay closed and have to be raised again.

## What stays for finance

A deactivated record keeps its issues, orders, approvals, hand-ins, alterations, requests and notes. Each issue keeps the cost it was issued at, so reports and the [journal export](/docs/reports/journal-export) go on including it.

## Delete

`Delete` appears only when the person has no issues and no orders, and asks for a confirmation. The server then checks everything else, and refuses if the record has any of:

- issues, orders, manager approvals, alterations or hand-ins;
- requests for them or raised by them;
- waitlist places, kit-check answers, damage reports or queries;
- a staff-app account.

The refusal lists what was found and says to deactivate instead.

> **Careful** A delete cannot be undone.

## Remove staff-app access

The `Staff app` panel on the same tab manages their account. It is read-only for an Issuer.

- **Remove access** deletes the account after a confirmation. Every session it had ends at once and any code is cleared. The register entry and history stay. To sign in again they need a new code.
- **Cancel the code** withdraws a code that has not been used. A code also stops working 14 days after it was generated.

Removing access does not deactivate the person. See [the staff app](/docs/apps/staff-app).

## Privacy requests

ThreadCount has no screen that exports or erases one person's information in a single step. What it has:

- The staff app shows a person their own record, and a query they raise there about it reaches the request queue under `Record queries`.
- The `People` export, searched to one name, gives that person's register row without notes or start date.
- The backup holds the whole facility. See [export and backup](/docs/account/export-and-backup).
- The `Note` panel on the `Uniform` tab can be edited or cleared by an Admin.
- A record with history cannot be deleted; it can be deactivated and its access removed.

The [privacy policy](/privacy) tells staff to ask their coordinator to remove their access, and says their register entry and history stay because the facility needs them for its own records. Anyone who would rather not ask their coordinator raises it with the facility's own privacy officer, because the facility runs the server and holds the records.

Deleting a whole facility is on [delete an account](/docs/account/delete-an-account).

## What is written

| Record | Change | Undo |
|---|---|---|
| Deactivate | The record marked inactive; waiting requests declined. | `Reactivate`. Closed requests stay closed. |
| Delete | The record removed. | None. |
| Remove access | The staff-app account deleted, any code cleared. | Generate a new code. |
| Cancel the code | The code cleared. | Generate a new code. |
