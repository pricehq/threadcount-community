#!/usr/bin/env bash
# Inventory multi-select bulk actions (catalog.bulk): discontinue/reinstate/supplier/group/reorder/price/history-safe delete.
set -u
B=${BASE:-http://127.0.0.1:3111}
# Refuses early, with the fix, when the server under test is in production mode with
# Turnstile refusing every auth route — otherwise the first signup fails and every check
# after it reports a security-check error instead of what it was testing.
. "$(dirname "$0")/e2e-preflight.sh"; e2e_preflight "$B"
T=${TMP:-/tmp}; J="$T/tc-bulk-cj.txt"; rm -f "$J"
PASS=0; FAIL=0
ok()   { PASS=$((PASS+1)); echo "  ✓ $1"; }
fail() { FAIL=$((FAIL+1)); echo "  ✗ $1 :: $2"; }
mut()  { curl -s -b "$J" -c "$J" -X POST "$B/api/mutate" -H 'content-type: application/json' -d "{\"op\":\"$1\",\"payload\":$2}"; }
check(){ local name=$1 out=$2 pat=$3; if echo "$out" | grep -q "$pat"; then ok "$name"; else fail "$name" "$(echo "$out" | head -c 300)"; fi; }
py()   { python3 -c "import sys,json; d=json.load(sys.stdin); $1"; }

TS=$(date +%s)
check "signup" "$(curl -s -c "$J" -X POST "$B/api/auth/signup" -H 'content-type: application/json' -H "x-forwarded-for: 10.9.$((RANDOM%250)).$((RANDOM%250))" -d "{\"first\":\"Bulk\",\"last\":\"Admin\",\"facility\":\"Bulk Hospital $TS\",\"email\":\"bulk$TS@example.com\",\"password\":\"password123\"}")" '"ok":true'
check "the facility names its staff groups" "$(e2e_groups "$B" "$J")" '"ok":true'
check "supplier" "$(mut supplier.add '{"name":"Alpha Supply"}')" '"id"'
check "supplier 2" "$(mut supplier.add '{"name":"Beta Supply"}')" '"id"'
R=$(mut import.rows '{"kind":"catalog","rows":[{"item":"Used Top","sku":"U1","supplier":"Alpha Supply","cost":"10","group":"Registered Nurse","sizes":"S|M"},{"item":"Unused Top","sku":"U2","supplier":"Alpha Supply","cost":"20","group":"Registered Nurse","sizes":"S|M"},{"item":"Stocked Top","sku":"U3","supplier":"Alpha Supply","cost":"30","group":"Security","sizes":"S|M"}]}')
check "catalog import 3" "$R" '"created":3'
check "opening on U3" "$(mut import.rows '{"kind":"opening","rows":[{"sku":"U3","size":"S","opening":"5"}]}')" '"created":1'
check "dept" "$(mut dept.save '{"name":"Ward 1","cc":"100"}')" '"ok":true'
check "staff" "$(mut import.rows '{"kind":"staff","rows":[{"num":"1","first":"A","last":"B","group":"Registered Nurse","dept":"Ward 1","top":"S","pants":"S"}]}')" '"created":1'
BK=$(curl -s -b "$J" "$B/api/backup")
U1=$(echo "$BK" | py 'print([i["id"] for i in d["items"] if i["sku"]=="U1"][0])'); U2=$(echo "$BK" | py 'print([i["id"] for i in d["items"] if i["sku"]=="U2"][0])'); U3=$(echo "$BK" | py 'print([i["id"] for i in d["items"] if i["sku"]=="U3"][0])')
ST=$(echo "$BK" | py 'print(d["staff"][0]["id"])')
# Two halves of the history the delete guard leans on. An order-in leaves an OrderLine and nothing
# else; only a shelf issue writes an Issue row, and until one existed here the leading issue.count
# term in catalog.bulk's history sum could have been struck out with this file still green.
check "issue U1 order-in (writes an OrderLine)" "$(mut issue.create "{\"staffId\":\"$ST\",\"apDeduct\":0,\"lines\":[{\"itemId\":\"$U1\",\"si\":0,\"qty\":1,\"src\":\"order\"}]}")" '"ordered":1'
check "opening on U1" "$(mut import.rows '{"kind":"opening","rows":[{"sku":"U1","size":"S","opening":"2"}]}')" '"created":1'
check "issue U1 off the shelf" "$(mut issue.create "{\"staffId\":\"$ST\",\"apDeduct\":0,\"lines\":[{\"itemId\":\"$U1\",\"si\":0,\"qty\":1,\"src\":\"stock\"}]}")" '"stock":1'
check "the shelf issue is on the record" "$(curl -s -b "$J" "$B/api/backup" | py 'print(len(d["issues"]))')" '^1$'

echo "== bulk actions"
check "empty selection rejected" "$(mut catalog.bulk '{"ids":[],"action":"discontinue"}')" 'Select at least'
check "unknown action rejected" "$(mut catalog.bulk "{\"ids\":[\"$U1\"],\"action\":\"zap\"}")" 'Unknown bulk action'
check "discontinue 2" "$(mut catalog.bulk "{\"ids\":[\"$U1\",\"$U2\"],\"action\":\"discontinue\"}")" '2 products discontinued'
# Which two, not how many: a where clause that lost its id filter and archived the wrong pair of
# the three still counts to two.
check "archived flag set" "$(curl -s -b "$J" "$B/api/backup" | py 'print(sorted((i["sku"], i["archived"]) for i in d["items"]))')" "\[('U1', True), ('U2', True), ('U3', False)\]"
check "reinstate 2" "$(mut catalog.bulk "{\"ids\":[\"$U1\",\"$U2\"],\"action\":\"reinstate\"}")" '2 products reinstated'
# That message is assembled from the selection count, so it comes back whether or not the write
# ran. Read the flag back, or the un-archiving half of the pair is never tested end to end.
check "reinstate cleared archived" "$(curl -s -b "$J" "$B/api/backup" | py 'print(sum(1 for i in d["items"] if i["archived"]))')" '^0$'
check "change supplier" "$(mut catalog.bulk "{\"ids\":[\"$U1\",\"$U2\",\"$U3\"],\"action\":\"supplier\",\"value\":\"Beta Supply\"}")" 'moved to Beta Supply'
check "supplier applied" "$(curl -s -b "$J" "$B/api/backup" | py 'print(all(i["supplier"]=="Beta Supply" for i in d["items"]))')" 'True'
check "change group" "$(mut catalog.bulk "{\"ids\":[\"$U3\"],\"action\":\"group\",\"value\":\"Kitchen\"}")" 'moved to group Kitchen'
# Group is what scopes a garment on the Issue screen, so a group change that quietly didn't land is
# a real thing to lose — and nothing else in this file ever reads a group back.
check "group applied to U3 only" "$(curl -s -b "$J" "$B/api/backup" | py 'print([i["group"] for i in d["items"] if i["sku"]=="U3"][0], sorted(i["group"] for i in d["items"]))')" "^Kitchen \['Kitchen', 'Registered Nurse', 'Registered Nurse'\]$"
check "set reorder" "$(mut catalog.bulk "{\"ids\":[\"$U1\",\"$U3\"],\"action\":\"reorder\",\"value\":\"7\"}")" 'Reorder level set to 7 on every size of 2 products'
# Filtering the stock rows down to the two products that were selected hid the opposite bug: a
# reorder that ignored `ids` and wrote 7 across the whole catalogue looked identical. U2 is the one
# unselected product, so name every row that exists — U2 has to have none.
check "reorder on every size of the selected products only" "$(curl -s -b "$J" "$B/api/backup" | py 'print(sorted((next(i["sku"] for i in d["items"] if i["id"]==s["itemId"]), s["reorder"]) for s in d["stock"]))')" "\[('U1', 7), ('U1', 7), ('U3', 7), ('U3', 7)\]"
check "bad price rejected" "$(mut catalog.bulk "{\"ids\":[\"$U1\"],\"action\":\"price\",\"value\":\"abc\"}")" 'Enter a price'
check "price +10%" "$(mut catalog.bulk "{\"ids\":[\"$U1\",\"$U2\"],\"action\":\"price\",\"value\":\"+10%\"}")" 'Prices updated on 2 products (+10%)'
check "price pct applied 11/22" "$(curl -s -b "$J" "$B/api/backup" | py 'print(sorted(i["cost"] for i in d["items"]))')" '\[11.\?0\?, 22.\?0\?, 30.\?0\?\]'
check "price absolute" "$(mut catalog.bulk "{\"ids\":[\"$U3\"],\"action\":\"price\",\"value\":\"\$25.50\"}")" 'Prices updated on 1 product\.'
check "abs price applied" "$(curl -s -b "$J" "$B/api/backup" | py 'print([i["cost"] for i in d["items"] if i["sku"]=="U3"][0])')" '^25.5$'
R=$(mut catalog.bulk "{\"ids\":[\"$U1\",\"$U2\",\"$U3\"],\"action\":\"delete\"}")
check "delete: 1 deleted, 2 discontinued" "$R" '"deleted":1,"discontinued":2'
check "delete message" "$R" '1 product deleted · 2 products had history or stock on hand'
check "unused item gone, others archived" "$(curl -s -b "$J" "$B/api/backup" | py 'print(sorted((i["sku"], i["archived"]) for i in d["items"]))')" "\[('U1', True), ('U3', True)\]"

echo "== a garment a ward has asked for"
# The kind of history the fixture above never covers, and the one the code warns about by name:
# RequestLine cascades from the garment, so bulk-deleting one a ward is waiting on strips the line
# out from under a live request and leaves the manager an ask with nothing on it. catalog.delete
# counts request lines for exactly that reason; catalog.bulk's `used` sum leaves the term out.
check "a fourth product" "$(mut import.rows '{"kind":"catalog","rows":[{"item":"Asked-for Top","sku":"U4","supplier":"Alpha Supply","cost":"40","group":"Registered Nurse","sizes":"S|M"}]}')" '"created":1'
check "somebody to approve for her" "$(mut import.rows '{"kind":"staff","rows":[{"num":"2","first":"M","last":"G","group":"Registered Nurse","dept":"Ward 1","top":"M","pants":"M"}]}')" '"created":1'
BK2=$(curl -s -b "$J" "$B/api/backup")
U4=$(echo "$BK2" | py 'print([i["id"] for i in d["items"] if i["sku"]=="U4"][0])'); MG=$(echo "$BK2" | py 'print([s["id"] for s in d["staff"] if s["num"]=="2"][0])')
check "she reports to them" "$(mut staff.patch "{\"id\":\"$ST\",\"managerId\":\"$MG\"}")" '"ok":true'
check "the counter raises a request for U4" "$(mut request.raise "{\"staffId\":\"$ST\",\"lines\":[{\"itemId\":\"$U4\",\"si\":0,\"qty\":1}],\"reason\":\"Worn out\"}")" '"code"'
check "delete: a request line counts as history" "$(mut catalog.bulk "{\"ids\":[\"$U4\"],\"action\":\"delete\"}")" '"deleted":0,"discontinued":1'
check "the request still has its garment on it" "$(curl -s -b "$J" "$B/api/backup" | py 'print(len(d["requests"][0]["lines"]))')" '^1$'

echo "== issuer gate"
check "add issuer" "$(mut users.add "{\"email\":\"bi$TS@example.com\",\"password\":\"password123\",\"first\":\"I\",\"last\":\"S\",\"role\":\"ISSUER\"}")" '"id"'
J2="$T/tc-bulk-cj2.txt"; rm -f "$J2"
curl -s -c "$J2" -X POST "$B/api/auth/login" -H 'content-type: application/json' -d "{\"email\":\"bi$TS@example.com\",\"password\":\"password123\"}" >/dev/null
check "issuer cannot bulk" "$(curl -s -b "$J2" -X POST "$B/api/mutate" -H 'content-type: application/json' -d "{\"op\":\"catalog.bulk\",\"payload\":{\"ids\":[\"$U1\"],\"action\":\"reinstate\"}}")" 'Admin only'

echo; echo "PASS=$PASS FAIL=$FAIL"; [ "$FAIL" -eq 0 ]
