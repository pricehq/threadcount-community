ThreadCount is now a uniform system for any organisation that issues uniform: hotels, security
crews, retail, cleaning and facilities, schools, transport, manufacturing and healthcare.

### Your own words

- The words the screens use for a team, the place stock is kept, a delivery run and the person on
  a team who signs for it are a setting on the facility, under `Settings › Facility › Words`.
- `Starting point` offers a set for each kind of organisation, and every word can be edited. The
  coordinator screens, the counter app, the staff app, slips, emails, phone notifications and
  exports all use them.
- Sign-up asks for the kind of organisation and fills the words in from it. The old setting answers
  (hospital, aged care, community health) still work and choose the healthcare words.
- The words are display only. Records, departments, cost centres and history are unchanged.

### Upgrading

- One migration adds a `terms` column to `Facility` and gives every existing facility the
  healthcare words, so an upgraded install reads exactly as it did. Choose another starting point
  under `Settings › Facility › Words` to change them. New facilities start from the kind of
  organisation chosen at sign-up, or the general set (team, uniform store, delivery round, team desk).
- A second migration removes what was left of the plan, billing, card-payment and multi-facility
  organisation layer: nineteen unused columns on `Facility`, one on `PlatformSwitch`, and the
  `Organisation`, `OrgUser`, `OrgCatalogItem`, `OrgSupplier`, `OrgEvent` and `PlanMail` tables.
  Nothing has read them since the last release. Organisation-wide single sign-on goes with them;
  single sign-on per facility is unchanged. Take a backup before upgrading if you want a copy.
- The manual has a new page, Your words, and quotes screens in the general words.
