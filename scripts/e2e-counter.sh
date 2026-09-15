#!/usr/bin/env bash
# The counter phone's server writes: per-line override reasons, the signed slip linked to the rows it
# covers, that slip in the staff app as words only, hand back as one all-or-nothing write, and count
# gap reasons filed line by line.
set -u
B=${BASE:-http://127.0.0.1:3111}
. "$(dirname "$0")/e2e-preflight.sh"; e2e_preflight "$B"
T=${TMP:-/tmp}; J="$T/tc-ctr-cj.txt"; W="$T/tc-ctr-wearer.txt"; W2="$T/tc-ctr-other.txt"; rm -f "$J" "$W" "$W2"
PASS=0; FAIL=0
ok()   { PASS=$((PASS+1)); echo "  ✓ $1"; }
fail() { FAIL=$((FAIL+1)); echo "  ✗ $1 :: $2"; }
mut()  { curl -s -b "$J" -c "$J" -X POST "$B/api/mutate" -H 'content-type: application/json' -H "origin: $B" -d "{\"op\":\"$1\",\"payload\":$2}"; }
check(){ local name=$1 out=$2 pat=$3; if echo "$out" | grep -q "$pat"; then ok "$name"; else fail "$name" "$(echo "$out" | head -c 300)"; fi; }
no()   { local name=$1 out=$2 pat=$3; if echo "$out" | grep -q "$pat"; then fail "$name" "$(echo "$out" | grep -o ".\{0,80\}$pat.\{0,80\}" | head -1)"; else ok "$name"; fi; }
py()   { python3 -c "import sys,json; d=json.load(sys.stdin); $1"; }
bk()   { curl -s -b "$J" "$B/api/backup"; }
PNG='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='
claim() { local sid=$1 jar=$2 email=$3
  local code; code=$(mut staff.selfCode "{\"id\":\"$sid\"}" | py "print(d['result']['code'])")
  curl -s -c "$jar" -X POST "$B/api/staff/activate" -H 'content-type: application/json' -H "origin: $B" \
    -d "{\"agreed\":true,\"code\":\"$code\",\"email\":\"$email\",\"password\":\"wearerpass1\"}"; }

TS=$(date +%s)
echo "== setup"
check "signup" "$(curl -s -c "$J" -X POST "$B/api/auth/signup" -H 'content-type: application/json' -H "x-forwarded-for: 10.41.$((RANDOM%250)).$((RANDOM%250))" -d "{\"first\":\"Cora\",\"last\":\"Counterhand\",\"facility\":\"Counter Hospital $TS\",\"email\":\"ctr$TS@example.com\",\"password\":\"password123\"}")" '"ok":true'
check "the facility names its staff groups" "$(e2e_groups "$B" "$J")" '"ok":true'
check "catalog" "$(mut import.rows '{"kind":"catalog","rows":[{"item":"RN Scrub Top","sku":"T1","supplier":"Alpha Supply","cost":"37","group":"Registered Nurse","sizes":"S|M"},{"item":"Security Shirt","sku":"S1","supplier":"Alpha Supply","cost":"41","group":"Security","sizes":"M|L"}]}')" '"created":2'
check "opening" "$(mut import.rows '{"kind":"opening","rows":[{"sku":"T1","size":"S","opening":"5"},{"sku":"T1","size":"M","opening":"5"},{"sku":"S1","size":"M","opening":"5"}]}')" '"created":3'
check "staff" "$(mut import.rows '{"kind":"staff","rows":[{"num":"1","first":"Nina","last":"Nurse","group":"Registered Nurse","dept":"Willow Ward","top":"M","pants":"M"},{"num":"2","first":"Omar","last":"Other","group":"Registered Nurse","dept":"Willow Ward","top":"M","pants":"M"}]}')" '"created":2'
BK=$(bk)
T1=$(echo "$BK" | py 'print([i["id"] for i in d["items"] if i["sku"]=="T1"][0])')
S1=$(echo "$BK" | py 'print([i["id"] for i in d["items"] if i["sku"]=="S1"][0])')
NINA=$(echo "$BK" | py 'print([s["id"] for s in d["staff"] if s["first"]=="Nina"][0])')
OMAR=$(echo "$BK" | py 'print([s["id"] for s in d["staff"] if s["first"]=="Omar"][0])')
check "Nina claims her staff app" "$(claim "$NINA" "$W" "nina$TS@example.com")" '"ok":true'
check "Omar claims his staff app" "$(claim "$OMAR" "$W2" "omar$TS@example.com")" '"ok":true'
SIG=$(mut photo.put "{\"kind\":\"sig\",\"data\":\"$PNG\"}" | py 'print(d["result"]["id"])')

echo "== per-line override reasons"
LINES_NOREASON="[{\"itemId\":\"$T1\",\"si\":1,\"qty\":1,\"src\":\"stock\",\"reason\":\"\"},{\"itemId\":\"$S1\",\"si\":0,\"qty\":1,\"src\":\"stock\",\"reason\":\"\"}]"
LINES_REASON="[{\"itemId\":\"$T1\",\"si\":1,\"qty\":1,\"src\":\"stock\",\"reason\":\"\"},{\"itemId\":\"$S1\",\"si\":0,\"qty\":1,\"src\":\"stock\",\"reason\":\"Manager asked\"}]"
check "a flagged line without a reason is refused, by name" "$(mut issue.create "{\"staffId\":\"$NINA\",\"apDeduct\":0,\"override\":true,\"lineReasons\":true,\"lines\":$LINES_NOREASON}")" 'Pick a reason for Security Shirt M'
check "a reason outside the list is refused" "$(mut issue.create "{\"staffId\":\"$NINA\",\"apDeduct\":0,\"override\":true,\"lineReasons\":true,\"lines\":[{\"itemId\":\"$S1\",\"si\":0,\"qty\":1,\"src\":\"stock\",\"reason\":\"Because\"}]}")" 'Pick a reason from the list'
check "a reason without the override is still refused" "$(mut issue.create "{\"staffId\":\"$NINA\",\"apDeduct\":0,\"lineReasons\":true,\"lines\":$LINES_REASON}")" '"error"'
check "nothing was written by the refusals" "$(bk | py 'print(len(d["issues"]))')" '^0$'
R=$(mut issue.create "{\"staffId\":\"$NINA\",\"apDeduct\":0,\"override\":true,\"lineReasons\":true,\"sigId\":\"$SIG\",\"slip\":true,\"lines\":$LINES_REASON}")
check "the signed issue goes through" "$R" '"stock":2'
SLIP=$(echo "$R" | py 'print(d["result"]["slipId"] or "")')
check "the flagged row carries its reason" "$(bk | py 'r=[i for i in d["issues"] if i["itemId"]=="'$S1'"][0]; print(r["overrideReason"], r["override"] or r["offGroup"], r["offGroup"])')" '^Manager asked True True$'
check "the unflagged row carries none" "$(bk | py 'r=[i for i in d["issues"] if i["itemId"]=="'$T1'"][0]; print(repr(r["overrideReason"]), r["offGroup"])')" "^'' False$"

echo "== the signed slip is linked"
check "issue.create returns the slip" "$SLIP" '^c'
check "the slip holds the signature, for the staff app" "$(bk | py 's=[s for s in d["slips"] if s["id"]=="'$SLIP'"][0]; print(s["sigId"]=="'$SIG'", s["toStaff"], s["kind"], s["staffId"]=="'$NINA'")')" '^True True issue True$'
check "both rows point at it and read signed" "$(bk | py 'print(sorted((i["slipId"]=="'$SLIP'", i["receipt"]) for i in d["issues"]))')" '\[(True, True), (True, True)\]'
check "an unknown signature is refused" "$(mut issue.create "{\"staffId\":\"$OMAR\",\"apDeduct\":0,\"sigId\":\"nope123\",\"slip\":true,\"lines\":[{\"itemId\":\"$T1\",\"si\":0,\"qty\":1,\"src\":\"stock\"}]}")" 'Photo not found'
SIG2=$(mut photo.put "{\"kind\":\"sig\",\"data\":\"$PNG\"}" | py 'print(d["result"]["id"])')
R=$(mut issue.create "{\"staffId\":\"$OMAR\",\"apDeduct\":0,\"sigId\":\"$SIG2\",\"slip\":false,\"lines\":[{\"itemId\":\"$T1\",\"si\":0,\"qty\":1,\"src\":\"stock\"}]}")
OSLIP=$(echo "$R" | py 'print(d["result"]["slipId"] or "")')
check "a slip kept off the staff app is still filed" "$(bk | py 's=[s for s in d["slips"] if s["id"]=="'$OSLIP'"][0]; print(s["toStaff"], bool(s["sigId"]))')" '^False True$'

echo "== the slip in the staff app, words only"
KIT=$(curl -s -b "$W" "$B/my/kit")
check "the kit screen offers Slips" "$KIT" 'Slips'
# The slips array as the kit screen received it, decoded out of the page's flight payload.
slips_of() { python3 -c '
import sys, json
t = sys.stdin.read().replace("\\\"", "\"")
i = t.find("\"slips\":")
if i < 0:
    print("NO-SLIPS"); sys.exit()
print(json.dumps(json.JSONDecoder().raw_decode(t, i + 8)[0]))'; }
SLIPS=$(echo "$KIT" | slips_of)
check "Nina's slip reaches her app, signed" "$(echo "$SLIPS" | py 'print([(len(x["lines"]), x["signed"]) for x in d if x["id"]=="'$SLIP'"])')" '^\[(2, True)\]$'
check "only her own slip" "$(echo "$SLIPS" | py 'print(len(d))')" '^1$'
check "the slip lists garments and sizes as words" "$(echo "$SLIPS" | py 'print(sorted((l["item"], l["size"]) for l in d[0]["lines"]))')" "\[('RN Scrub Top', 'M'), ('Security Shirt', 'M')\]"
check "a slip carries only its id, date, garments and signature" "$(echo "$SLIPS" | py 'print(sorted(d[0]), sorted({k for l in d[0]["lines"] for k in l}))')" "\['date', 'id', 'lines', 'signed'\] \['item', 'size'\]"
check "the signature is served to her" "$(curl -s -b "$W" -o /dev/null -w '%{http_code} %{content_type}' "$B/api/staff/slip/$SLIP/sig")" '200 image/png'
check "not to somebody else's staff session" "$(curl -s -b "$W2" -o /dev/null -w '%{http_code}' "$B/api/staff/slip/$SLIP/sig")" '404'
check "not without a session" "$(curl -s -o /dev/null -w '%{http_code}' "$B/api/staff/slip/$SLIP/sig")" '401'
check "a slip kept off the app isn't served even to its owner" "$(curl -s -b "$W2" -o /dev/null -w '%{http_code}' "$B/api/staff/slip/$OSLIP/sig")" '404'
no "no cost reaches the staff app" "$KIT" '"cost"\|\$37\|\$41\|37\.00\|41\.00'
no "no reason, override or issuer reaches the staff app" "$KIT" 'Manager asked\|overrideReason\|byName\|Counterhand'

echo "== hand back is all or nothing"
open_rows() { bk | py 'print(sorted((i["itemId"]=="'$T1'", i["returnedCond"]) for i in d["issues"] if i["staffId"]=="'$NINA'"))'; }
BEFORE=$(open_rows)
check "a basket with one line no longer on the record is refused" "$(mut handback.commit "{\"staffId\":\"$NINA\",\"lines\":[{\"itemId\":\"$T1\",\"si\":1,\"cond\":\"Returned - Good\"},{\"itemId\":\"$T1\",\"si\":0,\"cond\":\"Returned - Good\"}]}")" "isn’t on their record"
check "and the good line in it was not written" "$(open_rows)" "^$(printf '%s' "$BEFORE" | sed 's/[][\\.*^$]/\\&/g')$"
check "a swap on a lost garment is refused (a replacement is an issue)" "$(mut handback.commit "{\"staffId\":\"$NINA\",\"lines\":[{\"itemId\":\"$T1\",\"si\":1,\"cond\":\"Lost\",\"swapSi\":0}]}")" "Only a garment handed back in good condition"
check "and nothing was written" "$(open_rows)" "^$(printf '%s' "$BEFORE" | sed 's/[][\\.*^$]/\\&/g')$"
check "a bad condition is refused" "$(mut handback.commit "{\"staffId\":\"$NINA\",\"lines\":[{\"itemId\":\"$T1\",\"si\":1,\"cond\":\"Fine\"}]}")" 'Bad condition'
check "a whole basket commits" "$(mut handback.commit "{\"staffId\":\"$NINA\",\"lines\":[{\"itemId\":\"$T1\",\"si\":1,\"cond\":\"Returned - Good\",\"swapSi\":0},{\"itemId\":\"$S1\",\"si\":0,\"cond\":\"Lost\"}]}")" '"back":2,"swaps":1'
check "both lines stamped with their condition" "$(bk | py 'print(sorted(i["returnedCond"] or "" for i in d["issues"] if i["staffId"]=="'$NINA'"))')" "\['', 'Lost', 'Returned - Good'\]"
check "the swap is on her record in the new size" "$(bk | py 'print([(i["sizeIndex"], i["returnedDate"]) for i in d["issues"] if i["staffId"]=="'$NINA'" and not i["returnedCond"]], [s["top"] for s in d["staff"] if s["id"]=="'$NINA'"][0])')" '^\[(0, None)\] S$'

echo "== count gap reasons are filed per line"
check "the count commits" "$(mut stocktake.apply "{\"mode\":\"shelf\",\"lines\":[{\"itemId\":\"$T1\",\"si\":1,\"counted\":12,\"reason\":\"Found extra\"},{\"itemId\":\"$S1\",\"si\":1,\"counted\":0},{\"itemId\":\"$S1\",\"si\":0,\"counted\":0,\"reason\":\"Missing\"}]}")" '"variances":2'
check "each gap keeps its own reason" "$(bk | py 'print(sorted((l["sizeIndex"], l["counted"], l["reason"]) for t in d["stocktakes"] for l in t["lines"] if l["reason"]))')" "\[(0, 0, 'Missing'), (1, 12, 'Found extra')\]"

echo; echo "PASS=$PASS FAIL=$FAIL"; [ "$FAIL" -eq 0 ]
