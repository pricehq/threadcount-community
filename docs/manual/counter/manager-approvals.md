---
title: Manager approvals
section: counter
order: 4
summary: One manager on each staff record approves that person's requests and signs their order form. Setting the manager, deciding in the app or by email, self-approval, and recording a signed form.
screen: People › a person › Details & access
role: Admin or Issuer
keywords: manager, approval, approve, decline, approver, email link, self-approved, signed form, order form, record a signed form, sets, FTE, credit slip, delegate, reports to
---

Each staff record names one manager. That person approves the wearer's requests in the staff app and signs their paper order form.

## One manager per record

The manager is set in the `Manager` panel on a person's `Details & access` tab. Search the register by name or staff number and choose; it saves at once. Only an Admin can set, change or remove it; an Issuer sees the name, or `None set.`

- Anyone may be their own manager. The panel then shows `Self-approved`.
- An inactive person is not offered, and the server refuses one: `That manager is no longer active on the register.`
- A manager whom others still name cannot be deactivated: `<n> people still name <first name> as their manager, and a request can't be sent to somebody who is off the register. Give them a new manager first.`

The same tab has `Whose requests <first name> approves`. An Admin can add somebody with `Add somebody who reports to them`, which asks `Change <first name>’s record` first because it rewrites that person's manager, or take somebody off with `Remove from list`.

Without a manager, the staff app refuses to raise a request: `Your manager isn't set yet — the linen room has to record who approves your requests.`

A request is addressed to the manager recorded when it was raised. Changing the manager later does not move it; re-address it in the request queue ([Requests from staff](/docs/counter/requests-from-staff)).

## Deciding in the app

Requests waiting on somebody are listed in the staff app under `Team ▸ Approvals`, oldest first, with any of the manager's own set apart at the foot. `Approve <n> garments` on a row approves the whole request from the queue; `Open` decides it garment by garment. A declined garment needs one of 3 reasons: `Over allowance`, `Not needed right now` or `Wrong item for the role`. Every garment must be decided before sending.

When at least 1 garment is approved the request goes to the linen room; when none is, it is declined.

## Deciding by email

When a request is raised, its manager is emailed `Uniform request from <name>`, or `Uniform request for <name>` when somebody raised it on the wearer's behalf, provided they have a staff-app account and email is set up. The link opens a page showing the request. Nothing is decided until the manager chooses on that page. Where notifications are set up, their phone is told that something is waiting on them.

- The link lasts 14 days.
- It works once.

## Self-approval and the raise rule

Anybody may approve a request for their own uniform. It is never recorded as an ordinary approval: the history line names it as their own request, marked self-approved.

Nobody approves a request they raised for somebody else:

- Re-addressing to the raiser is refused: `<first name> raised this request, so it can't be sent back for <first name> to approve. Pick somebody else.`
- Sending a request to its wearer is refused unless they are set as their own manager.
- A decision by the raiser is refused: `You raised this request, so somebody else has to approve it — ask the linen room to re-address it.`

## Recording a signed order form

The `Approval` panel on a person's `Uniform` tab shows their route (`FTE table`, `Starting kit` or `Manager approval`), `Signed by the manager` and `Drawn`.

1. **Press `Print a new one`**, and have the manager sign it ([Slips and signatures](/docs/counter/slips-and-signatures)). `Order form` on the counter's person panel prints the same form.
2. **Press `Record a signed form`, then enter** `Sets`, `FTE`, `Date signed` and any `Note`. A date after today reads `After today: check the year.` and cannot be recorded.
3. **Press `Photo the signed form`** if you want the sheet on file.
4. **Press `Record approval`.** It needs an active manager set: `Set their manager first.`

The approval is recorded under the manager in the `Manager` panel. When the sets are above what the FTE table proposes, ThreadCount writes a sentence saying so after your note, and previews it under `Recorded as:` before you record.

`View the form` opens the photo. Sets come off at the [counter](/docs/counter/issue-a-garment) under `Sets off the signed form`.

Each approval is listed on the `History` tab under `Previous order forms`, reading `<n> of <m> left` or `Fully collected`, with `Signed form`, `Print the form` and `Credit slip`. An Admin can remove an approval with `×`.

## What is written

| Record | Change | Undo |
|---|---|---|
| Staff record | The manager | An Admin changes or removes it |
| Request and its lines | Each line approved or declined with a reason; status; a history line | None |
| Approval | Date signed, manager's name as signed, link to the manager, sets, FTE, note, photo; sets used starts at 0 | An Admin removes it |

The name on an approval is a copy. It still reads as signed after the manager is renamed or leaves.

> **In plain terms** The manager on the record is the only approver, on screen and on paper.
