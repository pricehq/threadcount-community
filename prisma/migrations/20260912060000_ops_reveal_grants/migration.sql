--
-- stray query in a projection would.
--
-- Created by hand as postgres before this migration reaches the box:
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ops_reveal') THEN
    RAISE NOTICE 'ops_reveal does not exist — grants skipped; create the role, then apply this block by hand';
    RETURN;
  END IF;
  GRANT USAGE ON SCHEMA public TO ops_reveal;
  GRANT SELECT ("id", "coordinator", "coordinatorEmail", "coordinatorPhone") ON "Facility" TO ops_reveal;
END $$;
