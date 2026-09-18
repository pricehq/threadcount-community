---
title: Catalogue, sizes and cuts
section: stock
order: 1
summary: The On hand list, how a garment is entered once, why a size is a position in its list, what a cut is, and where garments live.
screen: Stock › On hand
role: Admin
keywords: catalogue, garment, product, add garment, on hand, inventory, sizes, size run, cut, gender, men's, women's, unisex, staff groups, discontinue, duplicate, delete, price history, locations, shelf
---

## The On hand list

`Stock › On hand` lists every garment with a strip of its sizes and what each holds. The segment narrows it to `All`, `At reorder`, `Out`, `On order` or `No barcode`; `Filter garments`, `Group` and `Supplier` narrow it further. Click a size to open `Adjust quantity`, or the name to open the garment's page. **Export CSV** downloads every size.

Admins can tick garments for the bulk bar: `Discontinue`, `Reinstate`, `Delete`, `Set supplier`, `Set group`, `Set reorder` and `Apply price`.

## Adding a garment

A garment is one item in one colour: a name, a cut, a SKU, a supplier, a unit cost, a product type, staff groups, notes and a list of sizes. Stock, barcodes, reorder levels, supplier codes and shelf places are held per size.

1. **Press Add garment** at the top of `Stock`.
2. **Enter the garment.** The supplier list comes from `Settings › Catalogue & suppliers`.
3. **Add the sizes.** Type a size and press Enter, or pick from a run: `XS – 5XL`, `6 – 24` or `72 – 117`.
4. **Give each size its barcode and opening stock.** Both are optional.
5. **Press Add to catalogue.** It is refused without a name, a size and a cost (0 is a cost), or when one barcode is on two sizes.

The product type decides whether a garment counts as a top or trousers, half a set under the [entitlement rule](/docs/people/entitlement-rule), and the dialog says which. Many garments come in at once from `Settings › Data & audit log` with the Catalogue template (see [CSV templates](/docs/reference/csv-templates)).

## Cuts and staff groups

A garment's cut is `Unisex`, `Men's` or `Women's`, set in `Gender`. A men's or women's garment shows `(M)` or `(W)` after its name. A person's uniform style is set on their record in [People](/docs/people/staff-register). In an import, a gender starting with `m` is men's, one starting with `f` or `w` is women's, and anything else is unisex.

The staff groups tick-list says which groups a garment is for. **An empty list means every group.** Other groups can't request it, and need the override at the counter. In an import, groups are separated by `|`, and a blank group column on a re-import leaves a garment's groups as they were.

## A size is a position

ThreadCount records a size by its position in the size list, not by its name. Every issue, count, movement, barcode and reorder level points at a position.

- A new size goes on the end, from `Add a size` in the garment page's `Sizes` panel, or from **Scan sizes**. It starts with no barcode.
- Once anything is recorded against a garment, its sizes can't be reordered.
- **Remove** on a size row is refused if that size has an issue, stock on hand, an open supplier order, a stock movement, a stocktake, a hand-in, a team request, somebody waiting for it, a kit check answer or a record query. The refusal names which.
- Removing a size deletes its reorder level and barcode and moves every later size down one. A garment's last size can't be removed.

## Locations

`Stock › Locations` holds where garments live. A location is a `Room`, `Shelf`, `Bay`, `Laundry` or `External`, and can sit inside another. An Admin adds one with `New location`, `Kind` and `Inside`. **×** removes it: the locations inside move up a level and its sizes become unplaced. An Issuer sees the list read-only.

Anyone places a size with the `Location` select on the garment's page, and a count can then be scoped to that location (see [stocktakes](/docs/stock/stocktakes)).

## Discontinue, duplicate, delete

- **Discontinue**, from the garment page's menu or the bulk bar, takes a garment out of counts and reorder flags. Its stock still counts in the value on hand. **Reinstate** brings it back.
- **Duplicate** copies the type, gender, supplier, cost, notes, sizes and reorder levels, but no barcodes or stock. It is refused when a garment of that name already exists for the same groups.
- **Delete**, on the bulk bar, removes garments with nothing recorded against them. Anything with history or stock on hand is discontinued instead.

A change of unit cost, from **Edit garment**, `Apply price`, the order page or a delivery, adds an entry to `Price history`. Past issues keep their recorded price.

## What is written

| Action | Record · Change | Undo |
|---|---|---|
| Add to catalogue | New garment; barcodes; opening stock; a price history entry when the cost is above 0 | Delete while nothing is recorded, otherwise Discontinue |
| Change unit cost | Garment cost; a price history entry | Change it back |
| Add a size | Size appended | Remove, while nothing is recorded |
| Remove a size | Size, reorder level and barcode deleted; later sizes move down | Add it again, at the end |
| Discontinue | Garment marked discontinued | Reinstate |
| Duplicate | New garment with sizes and reorder levels | Delete |
| Remove a location | Location deleted; its sizes unplaced | Add it and re-place the sizes |
