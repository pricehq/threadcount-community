#!/usr/bin/env bash
# Counter app pack: locations (tree, placement, deletion), counting scoped to a location,
# the variance-reason gate, size exchange as one movement, /m auth, and the backup round-trip.
set -u
B=${BASE:-http://127.0.0.1:3111}
# Refuses early, with the fix, when the server under test is in production mode with
# Turnstile refusing every auth route — otherwise the first signup fails and every check
# after it reports a security-check error instead of what it was testing.
. "$(dirname "$0")/e2e-preflight.sh"; e2e_preflight "$B"
T=${TMP:-/tmp}; J="$T/tc-app-cj.txt"; K="$T/tc-app-cj2.txt"; rm -f "$J" "$K"
PASS=0; FAIL=0
ok()   { PASS=$((PASS+1)); echo "  ✓ $1"; }
fail() { FAIL=$((FAIL+1)); echo "  ✗ $1 :: $2"; }
mut()  { curl -s -b "$J" -c "$J" -X POST "$B/api/mutate" -H 'content-type: application/json' -d "{\"op\":\"$1\",\"payload\":$2}"; }
mut2() { curl -s -b "$K" -c "$K" -X POST "$B/api/mutate" -H 'content-type: application/json' -d "{\"op\":\"$1\",\"payload\":$2}"; }
check(){ local name=$1 out=$2 pat=$3; if echo "$out" | grep -q "$pat"; then ok "$name"; else fail "$name" "$(echo "$out" | head -c 300)"; fi; }
no()   { local name=$1 out=$2 pat=$3; if echo "$out" | grep -q "$pat"; then fail "$name" "$(echo "$out" | head -c 300)"; else ok "$name"; fi; }
py()   { python3 -c "import sys,json; d=json.load(sys.stdin); $1"; }
bk()   { curl -s -b "$J" "$B/api/backup"; }
# On hand for one variant, read the way the product reads it: what the shelf row says, less what is
# still out with staff. Takes an item id and a size index.
oh()   { bk | py "print([x['opening']+x['adj'] for x in d['stock'] if x['itemId']=='$1' and x['sizeIndex']==$2][0] - sum(i['qty'] for i in d['issues'] if i['itemId']=='$1' and i['sizeIndex']==$2 and not i['returnedDate']))"; }
res()  { py "print(d['result']$1)"; }

TS=$(date +%s)
echo "== setup"
check "signup" "$(curl -s -c "$J" -X POST "$B/api/auth/signup" -H 'content-type: application/json' -H "x-forwarded-for: 10.7.$((RANDOM%250)).$((RANDOM%250))" -d "{\"first\":\"App\",\"last\":\"Admin\",\"facility\":\"App Hospital $TS\",\"email\":\"app$TS@example.com\",\"password\":\"password123\"}")" '"ok":true'
check "the facility names its staff groups" "$(e2e_groups "$B" "$J")" '"ok":true'
check "supplier" "$(mut supplier.add '{"name":"Alpha Supply"}')" '"id"'
check "dept" "$(mut dept.save '{"name":"Willow Ward","cc":"RGH-3010"}')" '"ok":true'
check "catalog top" "$(mut import.rows '{"kind":"catalog","rows":[{"item":"Scrub Top","sku":"T1","supplier":"Alpha Supply","cost":"30","type":"Scrub top","group":"Registered Nurse","sizes":"S|M|L"}]}')" '"created":1'
check "catalog pant" "$(mut import.rows '{"kind":"catalog","rows":[{"item":"Scrub Pant","sku":"P1","supplier":"Alpha Supply","cost":"25","type":"Pants","group":"Registered Nurse","sizes":"S|M|L"}]}')" '"created":1'
check "opening" "$(mut import.rows '{"kind":"opening","rows":[{"sku":"T1","size":"M","opening":"20"},{"sku":"T1","size":"L","opening":"12"},{"sku":"P1","size":"M","opening":"15"}]}')" '"created":3'
check "staff" "$(mut import.rows '{"kind":"staff","rows":[{"num":"7","first":"Nina","last":"Nurse","group":"Registered Nurse","dept":"Willow Ward","top":"M","pants":"M"}]}')" '"created":1'
BK=$(bk)
T1=$(echo "$BK" | py 'print([i["id"] for i in d["items"] if i["sku"]=="T1"][0])')
P1=$(echo "$BK" | py 'print([i["id"] for i in d["items"] if i["sku"]=="P1"][0])')
NINA=$(echo "$BK" | py 'print(d["staff"][0]["id"])')

echo "== locations"
R=$(mut location.save '{"name":"Linen Room","kind":"Room"}'); check "room created" "$R" '"id"'; ROOM=$(echo "$R" | res "['id']")
R=$(mut location.save "{\"name\":\"Shelf B\",\"kind\":\"Shelf\",\"parentId\":\"$ROOM\"}"); check "shelf created" "$R" '"id"'; SHELF=$(echo "$R" | res "['id']")
R=$(mut location.save "{\"name\":\"Bay B3\",\"kind\":\"Bay\",\"parentId\":\"$SHELF\"}"); check "bay created" "$R" '"id"'; BAY=$(echo "$R" | res "['id']")
R=$(mut location.save '{"name":"Laundry","kind":"Laundry"}'); check "laundry created" "$R" '"id"'; LAUNDRY=$(echo "$R" | res "['id']")
check "duplicate name refused" "$(mut location.save '{"name":"Shelf B","kind":"Shelf"}')" 'already a location called'
check "unknown parent refused" "$(mut location.save '{"name":"Nowhere","parentId":"nope"}')" 'Unknown parent'
check "self-parent refused" "$(mut location.save "{\"id\":\"$SHELF\",\"name\":\"Shelf B\",\"parentId\":\"$SHELF\"}")" "can't sit inside itself"
check "loop refused (shelf inside its own bay)" "$(mut location.save "{\"id\":\"$SHELF\",\"name\":\"Shelf B\",\"parentId\":\"$BAY\"}")" "can't sit inside itself"
check "bad kind falls back to Shelf" "$(mut location.save '{"name":"Odd One","kind":"Nonsense"}')" '"id"'
check "kind is Shelf" "$(bk | py 'print([l["kind"] for l in d["locations"] if l["name"]=="Odd One"][0])')" 'Shelf'

echo "== placement"
check "place top M on the bay" "$(mut location.place "{\"itemId\":\"$T1\",\"si\":1,\"locationId\":\"$BAY\"}")" '"placed":1'
check "place top L on the shelf" "$(mut location.place "{\"itemId\":\"$T1\",\"si\":2,\"locationId\":\"$SHELF\"}")" '"placed":1'
check "bulk place" "$(mut location.place "{\"lines\":[{\"itemId\":\"$P1\",\"si\":1}],\"locationId\":\"$SHELF\"}")" '"placed":1'
check "unknown location refused" "$(mut location.place "{\"itemId\":\"$T1\",\"si\":0,\"locationId\":\"nope\"}")" 'Unknown location'
check "nothing to place refused" "$(mut location.place "{\"lines\":[],\"locationId\":\"$SHELF\"}")" 'Nothing to place'
check "placement lands in the backup" "$(bk | py "print(len([x for x in d['stock'] if x['locationId']=='$SHELF']))")" '2'

echo "== counting scoped to a location"
# Counting the shelf includes its bay: top M (bay), top L (shelf), pant M (shelf).
check "count the shelf" "$(mut stocktake.apply "{\"mode\":\"shelf\",\"locationId\":\"$SHELF\",\"lines\":[{\"itemId\":\"$T1\",\"si\":1,\"counted\":20},{\"itemId\":\"$T1\",\"si\":2,\"counted\":12},{\"itemId\":\"$P1\",\"si\":1,\"counted\":15}]}")" '"counted":3'
check "the count records its location" "$(bk | py 'print(d["stocktakes"][0]["locationId"] is not None)')" 'True'
check "a line off the shelf is refused" "$(mut stocktake.apply "{\"mode\":\"shelf\",\"locationId\":\"$LAUNDRY\",\"lines\":[{\"itemId\":\"$T1\",\"si\":1,\"counted\":20}]}")" "isn't on that shelf"
check "unknown location refused" "$(mut stocktake.apply "{\"mode\":\"shelf\",\"locationId\":\"nope\",\"lines\":[{\"itemId\":\"$T1\",\"si\":1,\"counted\":20}]}")" 'Unknown location'
check "an unscoped count still works" "$(mut stocktake.apply "{\"mode\":\"shelf\",\"lines\":[{\"itemId\":\"$T1\",\"si\":1,\"counted\":20}]}")" '"counted":1'

echo "== the variance-reason gate"
check "default threshold is 5" "$(bk | py 'print(d["facility"]["varianceReason"])')" '^5$'
check "a gap of 5 with no reason is refused" "$(mut stocktake.apply "{\"mode\":\"shelf\",\"lines\":[{\"itemId\":\"$T1\",\"si\":1,\"counted\":15}]}")" 'needs a reason'
check "a gap of 4 goes through" "$(mut stocktake.apply "{\"mode\":\"shelf\",\"lines\":[{\"itemId\":\"$T1\",\"si\":1,\"counted\":16}]}")" '"variances":1'
check "a gap of 5 with a reason goes through" "$(mut stocktake.apply "{\"mode\":\"shelf\",\"lines\":[{\"itemId\":\"$T1\",\"si\":1,\"counted\":11,\"reason\":\"At laundry\"}]}")" '"variances":1'
check "the reason is filed" "$(bk | py 'print([l["reason"] for t in d["stocktakes"] for l in t["lines"] if l["reason"]][0])')" 'At laundry'
check "threshold is configurable" "$(mut settings.update '{"varianceReason":2}')" '"ok":true'
check "the new threshold bites" "$(mut stocktake.apply "{\"mode\":\"shelf\",\"lines\":[{\"itemId\":\"$T1\",\"si\":1,\"counted\":9}]}")" 'needs a reason'
check "threshold floors at 1" "$(mut settings.update '{"varianceReason":0}')" '"ok":true'
check "stored as 1" "$(bk | py 'print(d["facility"]["varianceReason"])')" '^1$'
# Deliberately not 5. restoreBackup falls back to 5 when the file carries no threshold, so a
# facility sitting on 5 reads 5 after a restore whether the field made the round trip or not.
check "off the default threshold" "$(mut settings.update '{"varianceReason":3}')" '"ok":true'
check "on hand is what was counted" "$(bk | py "print([x['opening']+x['adj'] for x in d['stock'] if x['itemId']=='$T1' and x['sizeIndex']==1][0])")" '^11$'

echo "== size exchange"
check "issue an M top" "$(mut issue.create "{\"staffId\":\"$NINA\",\"lines\":[{\"itemId\":\"$T1\",\"si\":1,\"qty\":1,\"src\":\"stock\"}]}")" '"stock":1'
ISSUE=$(bk | py "print([i['id'] for i in d['issues'] if i['itemId']=='$T1' and i['sizeIndex']==1][0])")
OH_L_BEFORE=$(oh "$T1" 2)
check "same size refused" "$(mut issue.exchange "{\"id\":\"$ISSUE\",\"si\":1}")" 'Pick a different size'
check "unknown size refused" "$(mut issue.exchange "{\"id\":\"$ISSUE\",\"si\":9}")" 'Unknown size'
check "unknown issue refused" "$(mut issue.exchange '{"id":"nope","si":2}')" 'Unknown issue'
check "exchange M for L" "$(mut issue.exchange "{\"id\":\"$ISSUE\",\"si\":2}")" '"size":"L"'
check "the old issue came back" "$(bk | py "print([i['returnedCond'] for i in d['issues'] if i['id']=='$ISSUE'][0])")" 'Returned - Good'
check "a new issue went out in L" "$(bk | py "print(len([i for i in d['issues'] if i['itemId']=='$T1' and i['sizeIndex']==2 and not i['returnedDate']]))")" '^1$'
# An exchange is one movement: the L leaves the shelf and the M returns to it. Counting the issue
# rows alone would pass a swap that moved the wrong quantity, or moved the wrong size.
check "one L left the shelf" "$(oh "$T1" 2)" "^$((OH_L_BEFORE-1))$"
check "the M came back on the shelf" "$(oh "$T1" 1)" '^11$'
check "the staff record follows the size" "$(bk | py 'print(d["staff"][0]["top"])')" '^L$'
check "pants size untouched" "$(bk | py 'print(d["staff"][0]["pants"])')" '^M$'
check "exchanging again is refused" "$(mut issue.exchange "{\"id\":\"$ISSUE\",\"si\":0}")" 'already been returned'
check "no stock in S refuses the swap" "$(mut issue.exchange "{\"id\":\"$(bk | py "print([i['id'] for i in d['issues'] if i['itemId']=='$T1' and i['sizeIndex']==2 and not i['returnedDate']][0])")\",\"si\":0}")" 'Not enough size S'

echo "== deleting a location"
check "delete the shelf" "$(mut location.delete "{\"id\":\"$SHELF\"}")" '"ok":true'
check "its bay moved up to the room" "$(bk | py "print([l['parentId'] for l in d['locations'] if l['name']=='Bay B3'][0]=='$ROOM')")" 'True'
# Both numbers matter: three stock rows still there, two of them now homeless. Counting only the
# rows still pointing at the dead shelf reads zero even if the delete took the garments with it.
check "what was on it is unplaced" "$(bk | py "print(len(d['stock']), len([x for x in d['stock'] if x['locationId'] is None]))")" '^3 2$'
check "the bay's placement survived" "$(bk | py "print(len([x for x in d['stock'] if x['locationId']=='$BAY']))")" '^1$'
check "unknown location refused" "$(mut location.delete '{"id":"nope"}')" 'Unknown location'

echo "== permissions"
check "invite an issuer" "$(mut users.add "{\"email\":\"iss$TS@example.com\",\"first\":\"Ivy\",\"last\":\"Issuer\",\"role\":\"ISSUER\",\"password\":\"password123\"}")" '"id"'
check "issuer signs in" "$(curl -s -c "$K" -X POST "$B/api/auth/login" -H 'content-type: application/json' -d "{\"email\":\"iss$TS@example.com\",\"password\":\"password123\"}")" '"ok":true'
check "issuer cannot create a location" "$(mut2 location.save '{"name":"Sneaky Shelf"}')" 'Admin only'
check "issuer cannot delete a location" "$(mut2 location.delete "{\"id\":\"$BAY\"}")" 'Admin only'
check "issuer CAN place a garment" "$(mut2 location.place "{\"itemId\":\"$P1\",\"si\":1,\"locationId\":\"$BAY\"}")" '"placed":1'
check "issuer cannot raise the threshold" "$(mut2 settings.update '{"varianceReason":40}')" 'Admin only'

echo "== the app's own routes"
# /m sends people to the app's own sign-in, not the website's two-pane one.
check "/m needs a session" "$(curl -s -o /dev/null -w '%{http_code} %{redirect_url}' "$B/m")" '307.*/m/login'
check "/m/login is public" "$(curl -s -o /dev/null -w '%{http_code}' "$B/m/login")" '200'
check "/m/signup is public" "$(curl -s -o /dev/null -w '%{http_code}' "$B/m/signup")" '200'
check "/m/signed-in needs a session" "$(curl -s -o /dev/null -w '%{http_code}' "$B/m/signed-in")" '307'
check "sign-in names the numbered fields" "$(curl -s "$B/m/login")" 'WORK EMAIL\|Work email'
check "sign-in is honest about resets" "$(curl -s "$B/m/login")" 'Forgot password'
check "create account asks for the facility" "$(curl -s "$B/m/signup")" 'Hospital or facility'
no  "no NHS wording survived from the handoff" "$(curl -s "$B/m/login"; curl -s "$B/m/signup")" 'nhs.uk\|Trust or hospital'
check "/m/count needs a session" "$(curl -s -o /dev/null -w '%{http_code}' "$B/m/count")" '307'
# Where a retired screen now sends people. Under the loading boundary the redirect is streamed after
# the headers, so read it from either the Location header or the page's own redirect marker.
goesto() { local u; u=$(curl -s -b "$J" -o "$T/tc-app-redir.html" -w '%{redirect_url}' "$B$1"); printf '%s %s' "$u" "$(grep -o 'NEXT_REDIRECT;[a-z]*;[^"\\;]*\|next-page-redirect[^>]*' "$T/tc-app-redir.html" | head -1)"; }
check "/m renders Today for a signed-in user" "$(curl -s -b "$J" "$B/m")" 'Your day'
check "/m/count renders the shelf list" "$(curl -s -b "$J" "$B/m/count")" 'Count a shelf'
check "/m/stock renders" "$(curl -s -b "$J" "$B/m/stock")" 'Filter stock'
check "/m/people renders" "$(curl -s -b "$J" "$B/m/people")" 'Search the staff register'
check "/m/search now goes to People" "$(goesto /m/search)" '/m/people'
check "and carries the search with it" "$(goesto '/m/search?q=Nina')" '/m/people?q=Nina'
check "/m/settings renders the reason threshold" "$(curl -s -b "$J" "$B/m/settings")" 'Count gap needing a reason'
check "/m/variance renders" "$(curl -s -b "$J" "$B/m/variance")" 'Variance over time'
check "/m/label now goes to the stock list" "$(goesto /m/label)" '/m/stock?seg=all'
# The sign-in form is handed a sanitised `next`; Next's own route payload echoes the raw URL, so
# assert on the prop the form actually uses rather than on the page text.
nextprop() { curl -s "$B/auth?next=$1" | grep -o '\\"next\\":\\"[^\\]*' | head -1 | tr -d '\\' | cut -d'"' -f4; }
check "auth ?next=/m/count is honoured" "$(nextprop '/m/count')" '^/m/count$'
check "auth ?next=/app/stock is honoured" "$(nextprop '/app/stock')" '^/app/stock$'
check "auth ?next= off-site falls back to /app" "$(nextprop 'https%3A%2F%2Fevil.example')" '^/app$'
check "auth ?next= protocol-relative falls back to /app" "$(nextprop '%2F%2Fevil.example')" '^/app$'
check "auth ?next= to an unknown path falls back to /app" "$(nextprop '/mischief')" '^/app$'

echo "== labels print only real barcodes"
check "bind a supplier barcode" "$(mut barcode.bind "{\"itemId\":\"$T1\",\"si\":1,\"code\":\"9312345678907\"}")" '"ok":true'
# On a code that is really bound, the only thing left that can turn an anonymous visitor away is
# the session check — an unbound code goes to /app/stock whether the page is guarded or not.
check "/print/labels needs a session" "$(curl -s -o /dev/null -w '%{http_code} %{redirect_url}' "$B/print/labels?code=9312345678907")" '307.*/auth'
check "label sheet renders the bound code" "$(curl -s -b "$J" "$B/print/labels?code=9312345678907&copies=2")" '9312345678907'
check "it is drawn as bars" "$(curl -s -b "$J" "$B/print/labels?code=9312345678907&copies=2")" '<svg'
check "an unbound code has no sheet" "$(curl -s -o /dev/null -w '%{http_code}' -b "$J" "$B/print/labels?code=9999999999999")" '307'
check "copies are capped at 24" "$(curl -s -b "$J" "$B/print/labels?code=9312345678907&copies=999" | grep -o '<svg' | wc -l | tr -d ' ')" '^24$'
check "one copy means one label" "$(curl -s -b "$J" "$B/print/labels?code=9312345678907&copies=1" | grep -o '<svg' | wc -l | tr -d ' ')" '^1$'

echo "== backup round-trip"
SNAP=$(bk)
echo "$SNAP" > "$T/tc-app-backup.json"
check "backup carries locations" "$(echo "$SNAP" | py 'print(len(d["locations"])>=4)')" 'True'
# The live facility is moved off the file's value first, so the restore has to write the threshold
# back rather than be credited for a row that already happened to read right.
check "threshold moved before the restore" "$(mut settings.update '{"varianceReason":7}')" '"ok":true'
check "restore" "$(curl -s -b "$J" -X POST "$B/api/mutate" -H 'content-type: application/json' -d "{\"op\":\"backup.restore\",\"payload\":$(cat "$T/tc-app-backup.json")}")" '"ok":true'
NEW=$(bk)
check "locations survived" "$(echo "$NEW" | py 'print(len(d["locations"]))')" "$(echo "$SNAP" | py 'print(len(d["locations"]))')"
# Which parent, not merely that it has one: the restore re-mints every location id and wires the
# tree up in a second pass, so a mis-mapped parent hangs the bay off Laundry and still looks placed.
check "the tree survived" "$(echo "$NEW" | py 'byid={l["id"]:l["name"] for l in d["locations"]}; print(byid.get([l["parentId"] for l in d["locations"] if l["name"]=="Bay B3"][0]))')" '^Linen Room$'
# Which shelf, not how many rows have one. Both garments are on Bay B3, so a restore that pointed
# them at the wrong shelf keeps the count at two and loses the only thing a placement is for.
check "placements survived" "$(echo "$NEW" | py 'byid={l["id"]:l["name"] for l in d["locations"]}; print(", ".join(sorted(byid[x["locationId"]] for x in d["stock"] if x["locationId"])))')" '^Bay B3, Bay B3$'
check "the count's location survived" "$(echo "$NEW" | py 'print(len([t for t in d["stocktakes"] if t["locationId"]]))')" "$(echo "$SNAP" | py 'print(len([t for t in d["stocktakes"] if t["locationId"]]))')"
check "variance reasons survived" "$(echo "$NEW" | py 'print(len([l for t in d["stocktakes"] for l in t["lines"] if l["reason"]]))')" "$(echo "$SNAP" | py 'print(len([l for t in d["stocktakes"] for l in t["lines"] if l["reason"]]))')"
check "the threshold survived" "$(echo "$NEW" | py 'print(d["facility"]["varianceReason"])')" '^3$'

echo "== start fresh clears locations"
check "reset" "$(mut data.reset '{"confirm":"RESET"}')" '"ok":true'
check "no locations left" "$(bk | py 'print(len(d["locations"]))')" '^0$'

rm -f "$T/tc-app-backup.json"
echo
echo "PASS=$PASS FAIL=$FAIL"
[ "$FAIL" -eq 0 ]
