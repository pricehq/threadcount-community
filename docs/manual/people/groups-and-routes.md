---
title: Staff groups and routes
section: people
order: 2
summary: Name your staff groups, put each on the FTE table, the starting kit or manager approval on the route board, and restrict garments by group.
screen: Settings › Issuing rules
role: Admin
keywords: staff groups, groups, routes, route board, fte table, starting kit, manager approval, initial kit, rename group, remove group, garment groups, outside group, drag
---

## Name your groups

Staff groups are the facility's own names, on the board `Staff groups and how they get uniform` under `Settings › Issuing rules`. A new facility has none, so everyone is on manager approval.

- **Add** a name in `New group name`, then `Add group`. A new group starts on manager approval.
- **Rename** from the group's menu. It changes the name on the list, its route, every staff record filed under it and every garment tagged for it. Renaming onto a name already in use is refused. Changing only the case or spacing is allowed.
- **Remove** from the group's menu. It is refused while any active staff member is filed under the group.

A staff import adds nothing to the list. Groups on the register but not on the list appear under `On the register, not on the list`, each as an `Add` button with a head count. Their staff are on manager approval until the group is added and moved to another route.

An Issuer sees the board but cannot change it.

## The three routes

The board has three columns: `FTE table`, `Starting kit` and `Manager approval`. Each group is a chip in one of them. To change a group's route:

1. **Drag the chip** to another column, or
2. **Open the chip's menu** and pick `Move to …`, or
3. **Press `Alt+←` or `Alt+→`** with the chip focused to move it one column.

A group cannot be on two routes; the server refuses the save. If a restored backup carries a group on both, it is read as being on the FTE table.

Every route stops at the same ceiling of sets held (see [the entitlement rule](/docs/people/entitlement-rule)).

## The FTE table

The person's `Combined FTE` proposes their initial kit:

| FTE | Sets proposed |
|---|---|
| `1.0`, `0.9` | 5 |
| `0.8`, `0.7` | 4 |
| `0.6`, `0.5` | 3 |
| `0.4`, `0.3` | 2 |
| `0.2`, `0.1` | 1 |
| `Casual` | None. The form names 1, 2 or 3 and leaves the number to the manager. |

A fraction not on the table, such as `0.75`, is read by the band it falls in. With no FTE recorded, no kit is proposed and `People` lists the person under `No FTE`.

The proposal is not a limit. A manager may sign for more, and the signed form is recorded with a sentence added, such as `Above the FTE table: 5 sets at 0.6 FTE, where the table proposes 3. Approved by P. Nair.` A casual signed for more than 3 gets one too. A signature does not lift the ceiling.

## The starting kit

`Starting kit`, in sets on day one, is set under `Settings › Issuing rules`: 3 unless the facility sets its own. Nought saves as 3 and fractions are rounded down. A figure above the ceiling stops at the ceiling, and the screen says so. After day one, more is issued as needed up to the ceiling. Nothing has to be handed back first.

## Manager approval

There is no starting kit. The person's manager approves sets, on a signed order form recorded on their record or on a request in the staff app.

> **In plain terms** The counter refuses on the ceiling, the staff group and the uniform style. It does not refuse an issue because no approval is on file.

The `Approval` panel on the person's `Uniform` tab names their route. For the starting kit it counts every garment ever issued to them that was not pre-loved or returned in good condition. A hand-in does not give it back.

## Garments restricted by group

Each catalogue garment is tagged for one or more staff groups, or for all groups when it has no tag. See [catalogue, sizes and cuts](/docs/stock/catalogue-sizes-and-cuts).

- The staff app refuses a request for a garment outside the person's group. The one exception is a damage replacement for a garment they already hold.
- A request raised at the counter is refused the same way, and so is an order for the person.
- Issuing one at the counter needs `Record as an override` ticked. Each issue row is stamped as outside the group; for a garment ordered in, the order's notes say so instead.
- `Reports › People` lists these under `Exceptions` as `Outside their staff group on an override`.

## What is written

| Record | Change | Undo |
|---|---|---|
| Add group | The facility's group list. | Remove it while nobody active is filed under it. |
| Move a group | The facility's FTE-table and starting-kit lists. | Move it back. |
| Rename | The list, the route, staff records and garment tags. | Rename it back. |
| Remove | The group comes off the list and off its route. | Add it back and move it to its route again. |
