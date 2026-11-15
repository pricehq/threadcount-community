---
title: Managers
section: people
order: 4
summary: The one manager on each record approves that person's requests and signs their order forms. Self-approval, raising for others, email links and changing a manager.
screen: People › a person › Details & access
role: Admin
keywords: manager, approver, approval, sign, order form, signed form, self-approved, own manager, reports to, email link, needs an approver, re-address, reassign
---

## One manager, both jobs

Each record names at most one manager, in the `Manager` panel on the person's `Details & access` tab. That person approves their requests in the staff app, and a signed paper order form for them is recorded as signed by that manager.

1. **Type a name or staff number.** Only active people on the register are offered.
2. **Pick the name.** It saves straight away.

`Change` picks someone else. `Remove` clears it after a confirmation. Only an Admin can set or change a manager; an Issuer sees the name, or `None set.`. Setting a manager who is inactive is refused. The import's `manager` column sets the same field, by staff number.

Nobody can raise a request, in the staff app or at the counter, without a manager set. A manager who is no longer active counts as none: the request is refused with `The recorded manager is no longer on the register.`

The panel beside it lists whose requests the person approves. `Add somebody who reports to them` changes that other person's record, after a confirmation naming who they are being moved from. `Remove from list` clears that person's manager.

## What a manager signs

In the staff app, under `Team ▸ Approvals`, a manager approves or declines each garment, or the whole request from the queue. A decline needs a reason from a fixed list, and the wearer is emailed the decision if they have an account and the server sends mail — and told on their phone where notifications are set up. See [manager approvals](/docs/counter/manager-approvals) and [the staff app](/docs/apps/staff-app).

The uniform store cannot approve on a manager's behalf.

On paper, `Record a signed form` in the `Approval` panel of the `Uniform` tab takes `Sets`, `FTE`, `Date signed` (not after today), a `Note` and `Photo the signed form`. `Record approval` stays disabled until an active manager is set: with none recorded the form says `Set their manager first.`, and with an inactive one it says `Their manager is inactive: set a new one first.` It records the manager's name linked to their record. An Admin or Issuer can record one; only an Admin can remove one, with `×` under `Previous order forms` on the `History` tab.

## Self-approval

Anyone may be recorded as their own manager. The `Manager` panel then shows `(themselves)` and a `Self-approved` tag.

- A request they decide for themselves is written into its timeline as a self-approval, and `Previous order forms` tags it.
- A signed form they approved for themselves is tagged `Self-approved` on their record.
- In the staff app's approvals, their own requests are set apart under `Your own request`.

## Raising for somebody else

A manager can raise a request in the staff app, under `Team ▸ Raise`, for the people who report to them. Beside it, a tab headed with your word for a team, `Team` in the default words, lists who on their team holds what. Nobody approves a request they raised for somebody else, so it goes to the raiser's own manager instead. If there is nobody above, or the raiser is their own manager, it is created with no approver and waits in the request queue under `Needs an approver`.

A request raised at the counter goes to the person's own manager.

The coordinator addresses a waiting request from the queue, with the approver select and `Ask them` or `Re-address`. Sending it to the person who raised it is refused. Sending it to the person it is for is allowed only if they are recorded as their own manager.

## Email links

When a request is addressed to a manager who has a staff-app account, and the server is set up to send mail, the manager is emailed a link to approve or decline it.

- The link lasts 14 days, and works only while the request is still waiting. Once a decision is made, both links in the email stop working.
- Opening the link shows the request. The decision is made by pressing a button on that page, not by opening the link.
- If the manager or the wearer is no longer on the register, the page shows no details and decides nothing.
- A request for the manager's own uniform says `Your own uniform`.

A manager with no staff-app account is not emailed. The request still waits for them.

## Changing a manager

New requests go to the new manager. Requests already waiting stay addressed to the old manager until the coordinator re-addresses them. A manager cannot be deactivated while anyone else active still names them; give those people a new manager first. See [deactivating and deleting](/docs/people/deactivating-and-deleting).

## What is written

| Record | Change | Undo |
|---|---|---|
| Set or change a manager | The person's manager. | `Change` or `Remove`. |
| Record a signed form | An approval with sets, FTE, date, signer, note and photo. | `×` on the approval (Admin). |
| Re-address a request | The request's manager, and a timeline entry. | Re-address again while it waits. |
| Approve or decline | Request and garment statuses, and a timeline entry. | None. |
