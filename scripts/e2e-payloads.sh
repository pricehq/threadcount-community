#!/usr/bin/env bash
# Malformed list entries in a write: every op that takes a list of lines (or rows, or groups) is
# sent a list holding null, a number and a string, and has to refuse it as the sender's mistake,
# with a 400 and a sentence, and write nothing.
#
# Before this, `{"op":"stock.moves","payload":{"lines":[null]}}` read `l.itemId` off null and came
# back as a 500 "Something went wrong" filed with the error tracker, which is a server fault for
# what was a bad request.
set -u
B=${BASE:-http://127.0.0.1:3111}
. "$(dirname "$0")/e2e-preflight.sh"; e2e_preflight "$B"
T=${TMP:-/tmp}; J="$T/tc-payloads-cj.txt"; rm -f "$J"
PASS=0; FAIL=0
ok()   { PASS=$((PASS+1)); echo "  ✓ $1"; }
fail() { FAIL=$((FAIL+1)); echo "  ✗ $1 :: $2"; }
mut()  { curl -s -b "$J" -c "$J" -X POST "$B/api/mutate" -H 'content-type: application/json' -d "{\"op\":\"$1\",\"payload\":$2}"; }
# Status and body on one line: "<code> <body>".
mutc() { curl -s -b "$J" -c "$J" -o "$T/tc-payloads-body.txt" -w '%{http_code}' -X POST "$B/api/mutate" -H 'content-type: application/json' -d "{\"op\":\"$1\",\"payload\":$2}"; echo " $(head -c 300 "$T/tc-payloads-body.txt")"; }
check(){ local name=$1 out=$2 pat=$3; if echo "$out" | grep -q "$pat"; then ok "$name"; else fail "$name" "$(echo "$out" | head -c 300)"; fi; }
py()   { python3 -c "import sys,json; d=json.load(sys.stdin); $1"; }
XFF="x-forwarded-for: 10.9.$((RANDOM%250)).$((RANDOM%250))"

TS=$(date +%s)
echo "== setup"
check "signup admin" "$(curl -s -c "$J" -X POST "$B/api/auth/signup" -H 'content-type: application/json' -H "$XFF" -d "{\"first\":\"Pay\",\"last\":\"Load\",\"facility\":\"Payload Works $TS\",\"email\":\"payload$TS@example.com\",\"password\":\"password123\"}")" '"ok":true'
check "the facility names its staff groups" "$(e2e_groups "$B" "$J")" '"ok":true'
check "supplier" "$(mut supplier.add '{"name":"Northline Workwear"}')" '"id"'
check "garment" "$(mut catalog.add '{"item":"Polo","gender":"Unisex","group":"All","sku":"PO-1","supplier":"Northline Workwear","cost":20,"sizes":["S","M","L"]}')" '"id"'
check "wearer" "$(mut staff.save '{"num":"P1","first":"Ada","last":"Wearer","group":"Support Services","dept":"Front of house"}')" '"ok":true\|"id"'
BK=$(curl -s -b "$J" "$B/api/backup")
IT=$(echo "$BK" | py 'print(d["items"][0]["id"])')
ST=$(echo "$BK" | py 'print(d["staff"][0]["id"])')
O=$(mut order.create "{\"orderFor\":\"Stock\",\"supplier\":\"Northline Workwear\",\"lines\":[{\"itemId\":\"$IT\",\"size\":\"M\",\"qty\":2}]}")
OID=$(echo "$O" | py 'print(d["result"]["id"])')
check "order marked ordered" "$(mut order.status "{\"id\":\"$OID\",\"status\":\"Ordered\"}")" '"ok":true'
MOVES0=$(echo "$BK" | py 'print(len(d.get("moves", d.get("stockMoves", []))))')

# op, payload with BAD standing for the list under test.
CASES=(
  'stock.moves|{"mode":"Receive","lines":BAD}'
  'stock.moves|{"mode":"Opening","lines":BAD}'
  'stock.moves|{"mode":"Pre-loved","lines":BAD}'
  "issue.create|{\"staffId\":\"$ST\",\"lines\":BAD}"
  "handin.add|{\"staffId\":\"$ST\",\"lines\":BAD}"
  "handback.commit|{\"staffId\":\"$ST\",\"lines\":BAD}"
  'order.create|{"orderFor":"Stock","supplier":"Northline Workwear","lines":BAD}'
  'order.raiseList|{"groups":BAD}'
  "order.receive|{\"id\":\"$OID\",\"lines\":BAD}"
  'stocktake.apply|{"lines":BAD}'
  'location.place|{"lines":BAD}'
  'import.rows|{"kind":"staff","rows":BAD}'
)

echo "== a list holding null, a number or a string is a 400, never a 500"
for c in "${CASES[@]}"; do
  op=${c%%|*}; tpl=${c#*|}
  for bad in '[null]' '[7]' '["x"]'; do
    R=$(mutc "$op" "${tpl//BAD/$bad}")
    code=${R%% *}
    if [ "$code" = 400 ]; then ok "$op $bad → 400"
    else fail "$op $bad → 400" "$R"; fi
  done
done

echo "== nothing was written by the refused requests"
BK2=$(curl -s -b "$J" "$B/api/backup")
check "one order, still ordered" "$(echo "$BK2" | py 'print(len(d["orders"]), d["orders"][0]["status"])')" '^1 Ordered$'
check "no stock movements" "$(echo "$BK2" | py 'print(len(d.get("moves", d.get("stockMoves", []))))')" "^$MOVES0\$"
check "one wearer" "$(echo "$BK2" | py 'print(len(d["staff"]))')" '^1$'

echo "== well-formed lines still work"
check "receive without order" "$(mut stock.moves "{\"mode\":\"Receive\",\"lines\":[{\"itemId\":\"$IT\",\"si\":1,\"qty\":3}]}")" '"ok":true'

echo
echo "payloads: $PASS passed, $FAIL failed"
[ "$FAIL" = 0 ]
