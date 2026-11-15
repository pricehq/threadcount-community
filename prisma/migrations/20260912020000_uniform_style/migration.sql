-- Which cut of uniform somebody is offered.
--
-- Men are offered the men's cut, women the women's, everybody the unisex garments — and the
-- coordinator can overrule it. The field is named for what it decides rather than for anybody's
-- gender: a woman who wears the men's cut is set to Men's, and nobody has to argue about the label.
-- Its values are '', 'Men''s', 'Women''s' and 'Either'.
--
-- BLANK MEANS EVERY STYLE. This runs against live linen rooms, and a rule that took effect on
-- deploy would start refusing garments at the counter for people nobody has ever asked about. So
-- every existing record takes the blank default and goes on being offered the whole catalogue,
-- exactly as it is today, until a coordinator sets the field. Blank and 'Either' behave identically
-- when filtering; they are kept apart so the register can still list who nobody has decided yet.
ALTER TABLE "Staff" ADD COLUMN "uniformStyle" TEXT NOT NULL DEFAULT '';

-- A garment issued outside the wearer's uniform style on the coordinator's override. Its own flag
-- beside "offGroup" (the staff-group rule's) and "override" (the six-set ceiling's), so the record
-- says which rule was overridden rather than only that one was. Every existing issue predates the
-- rule and is not one.
ALTER TABLE "Issue" ADD COLUMN "offStyle" BOOLEAN NOT NULL DEFAULT false;
