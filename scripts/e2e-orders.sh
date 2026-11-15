#!/usr/bin/env bash
# The supplier order list: a code per size, needs built from reorder levels and split by supplier,
# raised as one placed order per supplier (and one per person for a counter "order in"), the A4
# sheet with the codes, the supplier email door, and the forecast arithmetic behind "Suggested".
#
# Needs a server in dev mode, like the other suites (`npm run dev -- -p 3111`). Nothing sends mail.
set -u
B=${BASE:-http://127.0.0.1:3111}
. "$(dirname "$0")/e2e-preflight.sh"; e2e_preflight "$B"
T=${TMP:-/tmp}; J="$T/tc-ord-cj.txt"; rm -f "$J"
PASS=0; FAIL=0
ok()   { PASS=$((PASS+1)); echo "  ✓ $1"; }
fail() { FAIL=$((FAIL+1)); echo "  ✗ $1 :: $(echo "$2" | head -c 300)"; }
check(){ local name=$1 out=$2 pat=$3; if echo "$out" | grep -q "$pat"; then ok "$name"; else fail "$name" "$out"; fi; }
no()   { local name=$1 out=$2 pat=$3; if echo "$out" | grep -q "$pat"; then fail "$name" "$out"; else ok "$name"; fi; }
mut()  { curl -s -b "$J" -c "$J" -X POST "$B/api/mutate" -H 'content-type: application/json' -d "{\"op\":\"$1\",\"payload\":$2}"; }
py()   { python3 -c "import sys,json; d=json.load(sys.stdin); $1"; }
bk()   { curl -s -b "$J" "$B/api/backup"; }
res()  { py "print(d['result']$1)"; }
page() { curl -s -b "$J" "$B$1"; }
code() { curl -s -o /dev/null -w '%{http_code}' -b "$J" "$B$1"; }
TS=$(date +%s)

echo "== a facility with two suppliers"
check "signup" "$(curl -s -c "$J" -X POST "$B/api/auth/signup" -H 'content-type: application/json' -H "x-forwarded-for: 10.12.$((RANDOM%250)).$((RANDOM%250))" -d "{\"first\":\"Ord\",\"last\":\"Admin\",\"facility\":\"Order Hospital $TS\",\"email\":\"ord$TS@example.com\",\"password\":\"password123\"}")" '"ok":true'
check "  groups" "$(e2e_groups "$B" "$J")" '"ok":true'
R=$(mut catalog.add '{"item":"Scrub Top","type":"Top","supplier":"Northline Workwear","sku":"ST","cost":22.5,"sizes":["S","M","L"]}'); ST=$(echo "$R" | res "['id']"); check "garment A (Northline)" "$R" '"id"'
R=$(mut catalog.add '{"item":"Fleece Jacket","type":"Jacket","supplier":"Harbour Embroidery","sku":"FJ","cost":48,"sizes":["M","L"]}'); FJ=$(echo "$R" | res "['id']"); check "garment B (Harbour)" "$R" '"id"'
check "both suppliers exist" "$(bk | py "print(sorted(s['name'] for s in d['suppliers']))")" "\['Harbour Embroidery', 'Northline Workwear'\]"
SUPS=$(bk | py "print(json.dumps({s['name']: s['id'] for s in d['suppliers']}))")
WWG=$(echo "$SUPS" | py "print(d['Northline Workwear'])"); QUA=$(echo "$SUPS" | py "print(d['Harbour Embroidery'])")

echo "== supplier codes, one per size"
check "code on Scrub Top M" "$(mut stock.supplierCode "{\"itemId\":\"$ST\",\"si\":1,\"code\":\"NW-10422-M\"}")" '"ok":true'
check "code on Scrub Top L" "$(mut stock.supplierCode "{\"itemId\":\"$ST\",\"si\":2,\"code\":\"NW-10422-L\"}")" '"ok":true'
check "code on Fleece M" "$(mut stock.supplierCode "{\"itemId\":\"$FJ\",\"si\":0,\"code\":\"HE-7781-M\"}")" '"ok":true'
check "a bad size is refused" "$(mut stock.supplierCode "{\"itemId\":\"$ST\",\"si\":9,\"code\":\"X\"}")" 'Invalid size'
check "the code lands in the backup" "$(bk | py "print([x['supplierCode'] for x in d['stock'] if x['itemId']=='$ST' and x['sizeIndex']==1][0])")" 'NW-10422-M'
check "the garment page shows it" "$(page "/app/stock/$ST")" 'NW-10422-M'

echo "== supplier email"
check "an email is accepted" "$(mut supplier.update "{\"id\":\"$WWG\",\"email\":\"orders@example.com\"}")" '"ok":true'
check "a bad one is refused" "$(mut supplier.update "{\"id\":\"$WWG\",\"email\":\"not-an-address\"}")" "doesn't look like an email"

echo "== stock below its reorder level"
check "opening stock" "$(mut stock.moves "{\"mode\":\"Opening\",\"lines\":[{\"itemId\":\"$ST\",\"si\":1,\"qty\":2},{\"itemId\":\"$ST\",\"si\":2,\"qty\":40},{\"itemId\":\"$FJ\",\"si\":0,\"qty\":1}]}")" '"ok":true'
check "reorder level 6 on Scrub Top M" "$(mut stock.reorder "{\"itemId\":\"$ST\",\"si\":1,\"reorder\":6}")" '"ok":true'
check "reorder level 4 on Fleece M" "$(mut stock.reorder "{\"itemId\":\"$FJ\",\"si\":0,\"reorder\":4}")" '"ok":true'
# The order list is the To order column on /app/orders since the portal overhaul; the old
# /app/orders/list address redirects there.
LIST=$(page /app/orders)
check "the order list renders" "$(code /app/orders)" '200'
check "  as the To order column" "$LIST" '>To order</h2>'
check "  with the Northline code as a line" "$LIST" '>NW-10422-M</'
check "  and the Harbour code as a line" "$LIST" '>HE-7781-M</'
no    "  not the size that is fine" "$LIST" '>NW-10422-L</'
check "the old list address redirects to it" "$(curl -s -o /dev/null -w '%{http_code} %{redirect_url}' -b "$J" "$B/app/orders/list")" '^30[78] .*/app/orders$'

echo "== a person's order stays its own"
R=$(mut staff.save '{"num":"4471","first":"Ali","last":"Hassan","dept":"Ward 4B","group":"Registered Nurse"}'); ALI=$(echo "$R" | res "['id']"); check "a staff member" "$R" '"id"'
R=$(mut order.create "{\"orderFor\":\"Staff Member\",\"staffId\":\"$ALI\",\"supplier\":\"Northline Workwear\",\"lines\":[{\"itemId\":\"$ST\",\"size\":\"L\",\"qty\":1}]}"); PO=$(echo "$R" | res "['id']"); check "a draft order for Ali" "$R" '"code"'
# React splits "for {who}" with an empty comment marker; read the text with those taken out.
check "the list shows it as its own group" "$(page /app/orders | sed 's/<!-- -->//g')" '<span>for Ali Hassan · '

echo "== raise"
R=$(mut order.raiseList "{\"groups\":[{\"kind\":\"stock\",\"supplier\":\"Northline Workwear\",\"ref\":\"NW-48211\",\"lines\":[{\"itemId\":\"$ST\",\"size\":\"M\",\"qty\":10}]},{\"kind\":\"stock\",\"supplier\":\"Harbour Embroidery\",\"lines\":[{\"itemId\":\"$FJ\",\"size\":\"M\",\"qty\":7}]},{\"kind\":\"draft\",\"id\":\"$PO\",\"ref\":\"NW-48212\"}]}")
check "three orders raised" "$(echo "$R" | res "['raised'].__len__()")" '^3$'
check "  the stock one carries the supplier's number" "$(echo "$R" | py "print([o['ref'] for o in d['result']['raised'] if o['supplier']=='Northline Workwear' and len(o['lines'])==1 and o['lines'][0]['size']=='M'][0])")" 'NW-48211'
check "  all three are placed, none draft" "$(bk | py "print(sorted(set(o['status'] for o in d['orders'])))")" "^\['Ordered'\]$"
check "  Ali's is still Ali's" "$(bk | py "print([o['staffId'] for o in d['orders'] if o['ref']=='NW-48212'][0]=='$ALI')")" 'True'
check "  one order per supplier for stock" "$(bk | py "print(sorted(o['supplier'] for o in d['orders'] if not o['staffId']))")" "^\['Harbour Embroidery', 'Northline Workwear'\]$"
WID=$(echo "$R" | py "print([o['id'] for o in d['result']['raised'] if o['ref']=='NW-48211'][0])")
check "an empty raise is refused" "$(mut order.raiseList '{"groups":[]}')" 'Nothing to raise'
check "a raised draft can't be raised twice" "$(mut order.raiseList "{\"groups\":[{\"kind\":\"draft\",\"id\":\"$PO\"}]}")" 'not a draft'
# Since the portal overhaul a size still at its reorder level stays listed with 0 to order (its
# need is on order), so "empty of needs" means: no draft left, nothing asks for stock, $0.00 panels.
AFTER=$(page /app/orders | sed 's/<!-- -->//g')
no    "the list is now empty of needs: Ali's draft is gone" "$AFTER" '<span>for Ali Hassan · '
no    "  no size still asks for stock" "$AFTER" 'tc-qty-val[^>]*>[1-9]'
no    "  no panel carries a cost" "$AFTER" '[0-9] lines\? · \$[1-9]'
check "  the covered sizes stay listed at nothing to order" "$AFTER" '1 line · \$0\.00'

echo "== the sheet"
SHEET=$(page "/print/supplier-order?id=$WID")
check "sheet renders" "$(code "/print/supplier-order?id=$WID")" '200'
check "  with the code" "$SHEET" 'NW-10422-M'
check "  the supplier's number" "$SHEET" 'NW-48211'
check "  the total" "$SHEET" '225.00'
check "  a quote-the-order line" "$SHEET" 'Please quote order'
check "  and stamps printedAt" "$(bk | py "print([o.get('printedAt') is not None for o in d['orders'] if o['id']=='$WID'][0])")" 'True'
PS=$(page "/print/supplier-order?id=$PO")
check "Ali's sheet says who it is for" "$PS" 'Ordered for'
check "  by name" "$PS" 'Ali Hassan'
check "a stranger's order id 404s to the list" "$(curl -s -o /dev/null -w '%{http_code}' -b "$J" "$B/print/supplier-order?id=nope")" '30[27]'

echo "== the email door"
check "no mail server: refused clearly" "$(mut order.email "{\"id\":\"$WID\"}")" 'Email is not set up\|has no email address'
QID=$(bk | py "print([o['id'] for o in d['orders'] if o['supplier']=='Harbour Embroidery'][0])")
check "no address: refused clearly" "$(mut order.email "{\"id\":\"$QID\"}")" 'has no email address'

echo "== forecast"
# 26 of Scrub Top L issued inside the 13-week window (today; issue.create carries no date) against
# 40 opening less 26 = 14 on hand and a 14-day lead: ~2/wk, 7 weeks of cover, suggested
# ceil(2 × (2 + 2)) = 8, and it does not run out before delivery. The override tick carries the
# counter past the six-set ceiling; this is arithmetic, not entitlement.
check "lead time 14 days on Northline" "$(mut supplier.update "{\"id\":\"$WWG\",\"lead\":14}")" '"ok":true'
for i in $(seq 1 13); do mut issue.create "{\"staffId\":\"$ALI\",\"lines\":[{\"itemId\":\"$ST\",\"si\":2,\"qty\":2,\"src\":\"stock\"}],\"override\":true}" >/dev/null; done
check "issues recorded" "$(bk | py "print(sum(i['qty'] for i in d['issues'] if i['itemId']=='$ST' and i['sizeIndex']==2))")" '^26$'
G=$(page "/app/stock/$ST")
# The count sits in its own mono span, so read the text with the tags taken out.
check "suggested 8 for size L" "$(echo "$G" | sed 's/<[^>]*>//g')" 'Suggested 8'
check "  7.0 wk cover · ~2/wk" "$G" '7.0 wk cover · ~2/wk'
no    "  and it does not run out before delivery" "$G" 'runs out before delivery'

echo; echo "passed $PASS, failed $FAIL"; [ "$FAIL" -eq 0 ]
