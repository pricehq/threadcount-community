---
title: Exchanges and returns
section: counter
order: 2
summary: The counter's Return, Swap a size and Hand in modes, and the pre-loved pool. What each writes and how it moves the sets a person holds.
screen: Counter
role: Admin or Issuer
keywords: return, returned, exchange, swap a size, wrong size, hand-in, hand in, pre-loved, preloved, rag, lost, written off, damaged, credit, receipt
---

Garments come back three ways, each a mode on `Counter` once a person is chosen. A return closes one issue line with a condition. A swap changes the size of the same garment. A hand-in takes back whatever the person brings and sorts it into the pre-loved pool or rags.

## Returns

`Return` mode lists every garment the person holds under `Holding`, with `Return` on each line. `Return` also sits against lines under `Holding now` in `Issue` mode, and on the person's record under `Uniform` and `History`.

1. **Press `Return`** on the line.
2. **Say how many are coming back** when the line is more than 1 garment. The rest stays out with the person.
3. **Take a photo if you want one.** `Photo the garment (damage evidence)` is optional.
4. **Press a condition:** `Returned – Good`, `Returned – Damaged`, `Lost` or `Written Off`.

Pressing the condition records the return. A garment issued from the shelf and returned `Returned – Good` counts back into the shelf figure; the other three conditions do not. A pre-loved garment returned `Returned – Good` goes back into the pre-loved pool instead. Today's returns are listed under `Returned today`.

Returns refuse `This issue has already been returned / written off` and `This garment was handed in on <date> — it's already back in the pool`.

## Swap a size

`Swap a size` mode lists each line the person holds.

1. **Choose the `New size`.** Each size shows how many are on the shelf, or in the pre-loved pool when the line was pre-loved.
2. **Set the quantity** when the line is more than 1 garment.
3. **Press `Swap`.**

A swap:

- marks the garments coming back `Returned - Good`, splitting the line when only part of it is swapped
- issues the new size today, condition `New` at today's catalogue cost, or `Pre-loved` at cost 0 from the pool when the original was pre-loved
- carries across `offGroup` and `offStyle` from the original line
- changes the top or pants size on the staff record when the garment is a top or pants

It makes no ceiling check. It refuses `Pick a different size`, `Not enough size <size> on the shelf`, `Not enough pre-loved size <size> in the pool`, `That garment has already been returned` and `That garment was handed in on <date>`. 

On a phone, the [counter app](/docs/apps/counter-app)'s `Hand back` segment takes returns and swaps together. Each line is one garment. Its condition chip records `Good` as `Returned - Good`, `Damaged` as `Returned - Damaged`, `Condemn` as `Written Off` and `Lost` as `Lost`. `Swap size` on a line issues the new size in the same record, with the same checks as `Swap a size`. `Record hand back` files every line at once, or none.

## Hand-ins

`Hand in` mode has `Record a hand-in`, and lists earlier hand-ins with `Receipt`. A person's record has `Record hand-in` under `History`.

1. **Add each garment and size.** Tap a size again to add one.
2. **Mark each line** `Good` or `Rag`, and `Laundered` or `Unlaundered`.
3. **Tick `Credit the good garments back`** if the approval and the yearly report figure should be credited.
4. **Press `Record hand-in`**, or `Record & print receipt`.

ThreadCount matches each line to the person's issues of that garment and size that are not returned or handed in: new before pre-loved, newest first. Matched issues are stamped handed in today; part of a line is split off. Good lines join the pre-loved pool and rags are counted for disposal, whether or not they matched an issue.

Credit applies only to Good lines matched to new, not pre-loved, issues. The larger of the credited tops and credited pants is given back as sets to the person's manager's approvals, newest first.

A hand-in refuses only `Add at least one garment` and `Invalid hand-in line`.

`Hand-in without a person`, at the top of `Counter`, opens `Adjust quantity` on its `Pre-loved` mode. It adds garments to the pool and matches no issue.

A damage report from the staff app is cleared on the `Damage` tab of the request queue with `Handed in at the counter`. Clearing it does not return the garment ([Requests from staff](/docs/counter/requests-from-staff)).

## The pre-loved pool

The pool is a count per garment and size. It grows from Good hand-in lines, from pre-loved garments returned `Returned – Good`, and from pre-loved garments given back in a swap. It shrinks when a pre-loved line is issued or swapped out.

A pre-loved issue costs the ward nothing and never comes off a manager's approval. It does count towards the ceiling. `Reports`, on its `People` view, shows `Pool today`. A count can cover the pool on its own ([Stocktakes](/docs/stock/stocktakes)).

## What is written

| Record | Change | Undo |
|---|---|---|
| Return | Return date today and the condition on the issue; photo linked | No screen reverses a return |
| Swap | Old line returned `Returned - Good`; new issue row today; staff record size | No screen reverses a swap |
| Hand-in | A hand-in with its lines; matched issues stamped handed in; pool up by the Good lines | No screen reverses a hand-in |
| Approval, on credit | Sets used go down | Issue the sets again |

A return, a swap or a hand-in matched to an issue takes those garments off the sets a person holds, credit ticked or not. A swap puts the new size on, so the count does not change. A hand-in line matching no issue changes nothing.

> **In plain terms** The credit tick is about approvals and reports; the hand-in itself is what makes room under the ceiling.
