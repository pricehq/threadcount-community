-- Which person on the register signed the form, not just what they were called at the time.
--
-- "Approved by" has been a typed name since the first form was entered, and the typed name is
-- staying exactly where it is. byName is the name AS SIGNED: a signed order form does not start
-- reading differently because the manager who signed it was later married, promoted or taken off
-- the register. What the typed name could never do was point at a person, so the only way to find
-- what a manager had approved was to match a string, and a spelling change broke the match
-- silently.
--
-- Nullable, and deliberately not backfilled. Every approval already recorded in this linen room
-- was typed before the register search existed, and guessing which person a signature meant would
-- put somebody's name against an approval nobody actually chose them for. Those rows keep their
-- signature and no link, which is the truth about them. New approvals get both, and a manager who
-- is not on the register at all — agency, visiting — still records as a signature alone.
ALTER TABLE "Approval" ADD COLUMN "byStaffId" TEXT;

-- The history of forms per staff member reads this column to answer "what has this manager
-- approved?". Without it that question is a scan of every approval the facility has ever recorded.
CREATE INDEX "Approval_byStaffId_idx" ON "Approval"("byStaffId");

-- ON DELETE SET NULL, and byName is what makes it safe. Removing a manager from the register must
-- not delete the approvals they signed — the sets somebody was actually issued would go off the
-- record with them — and it must not be refused either, or a room could never tidy up a manager
-- who has ever approved anything, which is most of them. The link goes, the approval and the
-- signature stay.
ALTER TABLE "Approval" ADD CONSTRAINT "Approval_byStaffId_fkey" FOREIGN KEY ("byStaffId") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;
