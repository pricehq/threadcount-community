-- Give the slips already in people's hands a printing date.
--
-- Staff.activateCodeAt was added for an expiry rule that was then never wired up: nothing wrote the
-- column and nothing read it. Now that the activation route refuses a slip printed more than
-- fourteen days ago, a row holding a code with no date reads as printed at the epoch, so every slip
-- outstanding on the day of the deploy would be refused as expired -- telling a nurse to go and ask
-- for a new one for a slip she was handed yesterday.
--
-- Stamping them now starts their fortnight from this deploy rather than from whenever they were
-- really printed. That is deliberately generous: these codes were valid a moment ago, and the only
-- alternative is silently killing every one of them. Rows whose code has already been spent or
-- cancelled carry a null activateCode and are left alone.
UPDATE "Staff"
   SET "activateCodeAt" = now()
 WHERE "activateCode" IS NOT NULL
   AND "activateCodeAt" IS NULL;
