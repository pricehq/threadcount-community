#!/usr/bin/env bash
# The catalogue as the phone drives it: create a garment, edit its card, add a size, set par,
# bind a barcode, archive and reinstate — plus the guards that stop a non-admin doing any of it
# and stop size history being rewritten.
set -u
B=${BASE:-http://127.0.0.1:3111}
# Refuses early, with the fix, when the server under test is in production mode with
# Turnstile refusing every auth route — otherwise the first signup fails and every check
# after it reports a security-check error instead of what it was testing.
. "$(dirname "$0")/e2e-preflight.sh"; e2e_preflight "$B"
T=${TMP:-/tmp}; J="$T/tc-cat-cj.txt"; K="$T/tc-cat-cj2.txt"; rm -f "$J" "$K"
PASS=0; FAIL=0
ok()   { PASS=$((PASS+1)); echo "  ✓ $1"; }
fail() { FAIL=$((FAIL+1)); echo "  ✗ $1 :: $2"; }
mut()  { curl -s -b "$J" -c "$J" -X POST "$B/api/mutate" -H 'content-type: application/json' -d "{\"op\":\"$1\",\"payload\":$2}"; }
mut2() { curl -s -b "$K" -c "$K" -X POST "$B/api/mutate" -H 'content-type: application/json' -d "{\"op\":\"$1\",\"payload\":$2}"; }
check(){ local name=$1 out=$2 pat=$3; if echo "$out" | grep -q "$pat"; then ok "$name"; else fail "$name" "$(echo "$out" | head -c 300)"; fi; }
py()   { python3 -c "import sys,json; d=json.load(sys.stdin); $1"; }
bk()   { curl -s -b "$J" "$B/api/backup"; }
res()  { py "print(d['result']$1)"; }

TS=$(date +%s)
echo "== setup"
check "signup" "$(curl -s -c "$J" -X POST "$B/api/auth/signup" -H 'content-type: application/json' \
  -H "x-forwarded-for: 10.11.$((RANDOM%250)).$((RANDOM%250))" \
  -d "{\"first\":\"Cat\",\"last\":\"Admin\",\"facility\":\"Cat Hospital $TS\",\"email\":\"cat$TS@example.com\",\"password\":\"password123\"}")" '"ok":true'
check "the facility names its staff groups" "$(e2e_groups "$B" "$J")" '"ok":true'

echo "== creating a garment from the phone"
check "a name is required" "$(mut catalog.add '{"item":"","sizes":["S"]}')" 'Item name required'
check "at least one size is required" "$(mut catalog.add '{"item":"Theatre Gown","sizes":[]}')" 'At least one size'
R=$(mut catalog.add '{"item":"Theatre Gown","type":"Gown","group":"Theatre","supplier":"Alpha Supply","sku":"TG1","cost":41.5,"sizes":["S","M","L"]}')
check "garment created" "$R" '"id"'
ID=$(echo "$R" | res "['id']")
# The order of the run is the assertion, not its length: every "si":N payload below addresses a
# size by its position, so a run that came back as M,S,L would still be three sizes and would still
# let every later check read back the index it just wrote.
check "the three sizes are in the order they were typed" "$(bk | py "print([i['sizes'] for i in d['items'] if i['id']=='$ID'][0])")" "^\['S', 'M', 'L'\]"
check "the supplier was created with it" "$(bk | py "print(any(s['name']=='Alpha Supply' for s in d['suppliers']))")" 'True'

echo "== editing the product card"
check "rename and reprice" "$(mut catalog.update "{\"id\":\"$ID\",\"item\":\"Theatre Gown (Blue)\",\"cost\":44}")" '"ok":true'
check "the name stuck" "$(bk | py "print([i['item'] for i in d['items'] if i['id']=='$ID'][0])")" 'Theatre Gown (Blue)'
check "the cost stuck" "$(bk | py "print([i['cost'] for i in d['items'] if i['id']=='$ID'][0])")" '^44'
check "a negative cost is refused" "$(mut catalog.update "{\"id\":\"$ID\",\"cost\":-1}")" 'Invalid cost'

echo "== sizes"
check "add a size" "$(mut catalog.update "{\"id\":\"$ID\",\"addSize\":\"XL\"}")" '"ok":true'
# addSize is the append path, and the item has no history yet, so nothing in the product stops it
# prepending or inserting. A count of four would not notice; the wrong run only surfaces later as a
# baffling failure in "but appending still works".
check "XL is appended to the end" "$(bk | py "print([i['sizes'] for i in d['items'] if i['id']=='$ID'][0])")" "^\['S', 'M', 'L', 'XL'\]"
check "a duplicate size is refused" "$(mut catalog.update "{\"id\":\"$ID\",\"addSize\":\"XL\"}")" 'already on the item'

echo "== par and barcode, the two things you set at a shelf"
check "set par on size M" "$(mut stock.reorder "{\"itemId\":\"$ID\",\"si\":1,\"reorder\":6}")" '"ok":true'
check "par stored" "$(bk | py "print([x['reorder'] for x in d['stock'] if x['itemId']=='$ID' and x['sizeIndex']==1][0])")" '^6$'
check "bind a barcode to size M" "$(mut barcode.bind "{\"code\":\"CAT$TS\",\"itemId\":\"$ID\",\"si\":1}")" '"ok":true'
check "barcode points at the size" "$(bk | py "print([b['sizeIndex'] for b in d['barcodes'] if b['code']=='CAT$TS'][0])")" '^1$'
check "the same code can't be bound twice" "$(mut barcode.bind "{\"code\":\"CAT$TS\",\"itemId\":\"$ID\",\"si\":2}")" 'is already on'
# bind ends in an upsert, so a refusal that never happened moves the label to size L rather than
# leaving it where it was. Reading it back is the half that proves the shelf is still right.
check "and it stayed on size M" "$(bk | py "print([b['sizeIndex'] for b in d['barcodes'] if b['code']=='CAT$TS'][0])")" '^1$'

echo "== history protects the size order"
# The import matches on sku, then resolves the size by name to a position. "created" is a
# processed-row counter — it says 1 whether the row landed on M or on L — so the quantity is read
# back off the position instead. (The history the next check leans on is already there: the par
# level and the barcode above both count towards it.)
check "an opening import finds the size by name" "$(mut import.rows "{\"kind\":\"opening\",\"rows\":[{\"sku\":\"TG1\",\"size\":\"M\",\"opening\":\"5\"}]}")" '"errors":\[\]'
check "opening stock lands on size M" "$(bk | py "print([x['opening'] for x in d['stock'] if x['itemId']=='$ID' and x['sizeIndex']==1][0])")" '^5$'
check "sizes can't be reordered once there is history" "$(mut catalog.update "{\"id\":\"$ID\",\"sizes\":[\"M\",\"S\",\"L\",\"XL\"]}")" "can't be removed or reordered"
check "but appending still works" "$(mut catalog.update "{\"id\":\"$ID\",\"sizes\":[\"S\",\"M\",\"L\",\"XL\",\"2XL\"]}")" '"ok":true'

echo "== archive and reinstate"
check "archive" "$(mut catalog.update "{\"id\":\"$ID\",\"archived\":true}")" '"ok":true'
check "it reads as archived" "$(bk | py "print([i['archived'] for i in d['items'] if i['id']=='$ID'][0])")" 'True'
check "reinstate" "$(mut catalog.update "{\"id\":\"$ID\",\"archived\":false}")" '"ok":true'
# A garment that archives but never comes back is the failure this section exists to catch, and
# "ok":true is what catalog.update says to any patch it accepted — including one that ignored this.
check "it reads as live again" "$(bk | py "print([i['archived'] for i in d['items'] if i['id']=='$ID'][0])")" '^False$'

echo "== an issuer can look but not touch"
check "invite an issuer" "$(mut users.add "{\"email\":\"catiss$TS@example.com\",\"first\":\"Ines\",\"last\":\"Issuer\",\"role\":\"ISSUER\",\"password\":\"password123\"}")" '"id"'
check "issuer signs in" "$(curl -s -c "$K" -X POST "$B/api/auth/login" -H 'content-type: application/json' -d "{\"email\":\"catiss$TS@example.com\",\"password\":\"password123\"}")" '"ok":true'
check "issuer cannot create a garment" "$(mut2 catalog.add '{"item":"Sneaky Coat","sizes":["M"]}')" 'Admin only'
check "issuer cannot edit the card" "$(mut2 catalog.update "{\"id\":\"$ID\",\"item\":\"Renamed\"}")" 'Admin only'
check "issuer cannot archive" "$(mut2 catalog.update "{\"id\":\"$ID\",\"archived\":true}")" 'Admin only'
# Every field the issuer's three attempts reached for: the name, and the archive flag — a garment
# left discontinued by a broken guard is invisible on the catalogue screen, and the name alone
# would never see it.
check "the garment is untouched" "$(bk | py "print([[i['item'], i['archived']] for i in d['items'] if i['id']=='$ID'][0])")" "^\['Theatre Gown (Blue)', False\]"
check "and nothing was created" "$(bk | py "print(any(i['item']=='Sneaky Coat' for i in d['items']))")" '^False$'

echo "== the phone routes exist and need a session"
check "/m/catalogue needs a session" "$(curl -s -o /dev/null -w '%{http_code} %{redirect_url}' "$B/m/catalogue")" '307.*/m/login'
check "/m/catalogue renders for a signed-in admin" "$(curl -s -b "$J" "$B/m/catalogue")" 'Catalogue'
check "the product card renders" "$(curl -s -b "$J" "$B/m/catalogue/$ID")" 'Sizes'
check "the new-garment form renders" "$(curl -s -b "$J" "$B/m/catalogue/new")" 'New garment'

echo; echo "PASS=$PASS FAIL=$FAIL"; [ "$FAIL" -eq 0 ]
