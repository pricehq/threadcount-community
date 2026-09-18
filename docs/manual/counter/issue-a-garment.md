---
title: Issue a garment
section: counter
order: 1
summary: Choose the person, add the garments, pick where each comes from, record it. What is written, and what the counter refuses.
screen: Counter
role: Admin or Issuer
keywords: issue, issue stock, counter, scan, barcode, badge, six sets, ceiling, override, pre-loved, order in, usual sizes, repeat last, refusal, slip, hand out uniform
---

`Counter` serves one person at a time. You choose the person first, then the mode: `Issue`, `Return`, `Hand in` or `Swap a size`. This page covers `Issue`; the other three are on [Exchanges and returns](/docs/counter/exchanges-and-returns). The server repeats every check the screen makes.

## At the counter

1. **Find the person.** Type a name or staff number into `Find a person`, or scan their badge. Up to 8 active people are listed, each with `Tops` and `Pants` meters. Enter picks an exact staff-number match, or else the first row. A badge scanned anywhere in the portal opens the counter with that person.
2. **Check the person panel.** It shows their group, team, cost centre, cut and usual sizes, then how they get uniform: `FTE table`, `Starting kit` or `Manager approval`, and what the manager has signed.
3. **Add garments.** Scan into `Scan a garment, or type a name`, use `Scan with the camera`, or tap one of the usual chips. Typing 2 or more characters lists matching garments with a size strip; ones outside the person's group or cut are listed under `Other garments`. Tap a size again for one more.
4. **Choose a source for each line** in `This pickup`: `Shelf`, `Pre-loved` (shown when the pool holds some) or `Order in`. A line that could come from the shelf or the pool reads `Pick a source` until you choose.
5. **Read the line under the pickup.** It says `After this she holds 4 of 6 sets`, and names each reason the pickup needs an override.
6. **Set `Sets off the signed form`** when the person has a manager's approval with sets left. It starts at the larger of the tops and the pants in the pickup, not counting pre-loved lines.
7. **Print the `Collection slip`** if you need one, then press `Record issue`, or Ctrl+Enter (Cmd+Enter on a Mac).

`Repeat last · <date>` refills the pickup with every unreturned line from the person's most recent issue date, as shelf lines. `Change person` or Esc starts again; Esc does nothing while the pickup has lines in it.

An unknown barcode opens `Unknown barcode` for an Admin ([Barcodes](/docs/stock/barcodes)). An Issuer sees `No garment has <code>.`

## What is written

| Record | Change | Undo |
|---|---|---|
| Issue, from the shelf | One row per line: today's date, condition `New`, today's catalogue cost | Record a return |
| Issue, pre-loved | Condition `Pre-loved`, cost 0; the pool goes down | Return it as `Returned – Good` |
| Replenishment draft | Shelf lines added to the supplier's draft order | Edit the draft on `Orders` |
| Order, for `Order in` | One order per supplier, status `Ordered`, for this person | Received lines join the [pickup call list](/docs/counter/pickup-call-list) |
| Manager's approval | Sets used go up, oldest approval first | A credited hand-in gives sets back |

An override is stamped only on the rows it applies to: `override` for the ceiling, `offGroup` for a garment outside the staff group, `offStyle` for the wrong cut. For `Order in` lines it is written into the order's note.

## What the counter refuses

`Record issue` stays disabled while a line has no source, a line asks for more than the shelf or pool holds (`Not enough on the shelf`, `Not enough pre-loved`), the person is inactive, or a reason needs the override tick. The server refuses the same cases:

| Refusal | Why |
|---|---|
| `This staff member is inactive — reactivate them on their profile first` | The record is inactive |
| `Not enough on the shelf for <garment> <size>` | Shelf below the pickup |
| `Not enough pre-loved <garment> <size> in the pool` | Pool below the pickup |
| `<garment> is discontinued` | The garment is archived |
| `A. Hassan is holding 6 tops and 5 pairs. That would be 7 tops and 5 pairs, and the most anyone holds is 6 sets — 6 tops and 6 pairs. Hand a top in to make room, or a coordinator can record an override.` | Past the ceiling |
| `<garment> is for <groups> — <name> is in <group>. Tick the coordinator override to issue it anyway.` | Outside their staff group |
| `<garment> is the <cut> cut — <name> is set to <style>. Tick the coordinator override to issue it anyway.` | Not their cut |

A refusal ending `refresh and try again` means somebody changed the shelf, the pool, the approval or the person's holdings while you were serving. Refresh and record again.

## The ceiling and the override

The ceiling is sets held at any time: 6 unless the facility has set its own figure under `Settings › Issuing rules`. Tops and pants are counted separately. Garments outside a set have a ceiling of the same number, counted in garments. Holdings include garments on order, waiting to collect, and in approved request bags. Pre-loved garments count. See [The entitlement rule](/docs/people/entitlement-rule).

One tick, `Record as an override`, answers the ceiling, the staff group and the cut together. It clears when you change the person or anything in the pickup.

> **In plain terms** A hand-in makes room; an override records that somebody chose to go past the rule.

## On a phone

In the [counter app](/docs/apps/counter-app), open the person and stay on `Issue`.

1. **Add the lines.** Tap `+` on a size card, or `Scan a garment`. The meters fill as you add.
2. **Answer each flag.** A line past the ceiling, outside their group or outside their cut is flagged `Over 6 sets`, `Not for <group>` or `Not for <cut>`. Pick one reason for each: `Soiled on shift`, `Replacing damaged`, `Manager asked` or `Other`.
3. **Press `Review and sign`.** For a group whose raises need a manager, set how many sets come off the approval.
4. **Have them sign**, and leave `Send the slip to their staff app` on if they have a staff app sign-in.
5. **Press `Issue`.**

The server runs the same checks again and refuses a flagged line with no reason. Each flagged line's row stores its reason in `overrideReason`, beside `override`, `offGroup` and `offStyle`. The signature sets the signed tick on every row and files a slip; a slip sent to the staff app lists garments, sizes, the date and the signature only.
