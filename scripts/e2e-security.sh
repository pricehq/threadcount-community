#!/usr/bin/env bash
# Security hardening checks: headers, CSRF/origin gating, session invalidation on password change, rate limits,
# demo session guard, proxy bad-cookie recovery, receipt cost validation, admin-only write-offs, locked orders, hand-in/return double-count guards.
set -u
B=${BASE:-http://127.0.0.1:3111}
# Refuses early, with the fix, when the server under test is in production mode with
# Turnstile refusing every auth route — otherwise the first signup fails and every check
# after it reports a security-check error instead of what it was testing.
. "$(dirname "$0")/e2e-preflight.sh"; e2e_preflight "$B"
T=${TMP:-/tmp}; J="$T/tc-sec-cj.txt"; rm -f "$J"
PASS=0; FAIL=0
ok()   { PASS=$((PASS+1)); echo "  ✓ $1"; }
fail() { FAIL=$((FAIL+1)); echo "  ✗ $1 :: $2"; }
mut()  { curl -s -b "$J" -c "$J" -X POST "$B/api/mutate" -H 'content-type: application/json' -d "{\"op\":\"$1\",\"payload\":$2}"; }
check(){ local name=$1 out=$2 pat=$3; if echo "$out" | grep -q "$pat"; then ok "$name"; else fail "$name" "$(echo "$out" | head -c 300)"; fi; }
py()   { python3 -c "import sys,json; d=json.load(sys.stdin); $1"; }
bk()   { curl -s -b "$J" "$B/api/backup"; }

echo "== headers"
H=$(curl -s -D - -o /dev/null "$B/" | tr A-Z a-z)
check "CSP present" "$H" 'content-security-policy: .*frame-ancestors .none.'
check "HSTS" "$H" 'strict-transport-security'
check "nosniff" "$H" 'x-content-type-options: nosniff'
check "no x-powered-by" "$(echo "$H" | grep -ci 'x-powered-by' || true)" '^0$'
check "referrer policy" "$H" 'referrer-policy'

echo "== CSRF / origin gating"
TS=$(date +%s); EMAIL="sec$TS@example.com"
check "cross-site signup refused" "$(curl -s -X POST "$B/api/auth/signup" -H 'content-type: application/json' -H 'origin: https://evil.example' -d '{}')" 'Cross-site'
check "sec-fetch-site cross-site refused" "$(curl -s -X POST "$B/api/auth/login" -H 'content-type: application/json' -H 'sec-fetch-site: cross-site' -d '{}')" 'Cross-site'
check "text/plain form body refused" "$(curl -s -X POST "$B/api/auth/login" -H 'content-type: text/plain' -d '{"email":"a@b.c","password":"x"}')" 'Expected JSON'
check "signup ok" "$(curl -s -c "$J" -X POST "$B/api/auth/signup" -H 'content-type: application/json' -H "x-forwarded-for: 10.9.$((RANDOM%250)).$((RANDOM%250))" -d "{\"first\":\"Sec\",\"last\":\"Admin\",\"facility\":\"Sec Hospital $TS\",\"email\":\"$EMAIL\",\"password\":\"password123\"}")" '"ok":true'
check "the facility names its staff groups" "$(e2e_groups "$B" "$J")" '"ok":true'
check "mutate cross-site refused" "$(curl -s -b "$J" -X POST "$B/api/mutate" -H 'content-type: application/json' -H 'origin: https://evil.example' -d '{"op":"settings.update","payload":{}}')" 'Cross-site'
check "mutate same-origin ok" "$(curl -s -b "$J" -X POST "$B/api/mutate" -H 'content-type: application/json' -H "origin: $B" -H 'sec-fetch-site: same-origin' -d '{"op":"settings.update","payload":{"coordinator":"X"}}')" '"ok":true'
check "logout cross-site refused" "$(curl -s -b "$J" -X POST "$B/api/auth/logout" -H 'origin: https://evil.example')" 'Cross-site'

echo "== session bound to password"
OLD=$(grep tc_session "$J" | awk '{print $7}')
check "old token works" "$(curl -s -b "tc_session=$OLD" -o /dev/null -w '%{http_code}' "$B/api/backup")" '200'
check "change password" "$(mut me.password '{"current":"password123","next":"password456"}')" '"ok":true'
check "old token dead after password change" "$(curl -s -b "tc_session=$OLD" -o /dev/null -w '%{http_code}' "$B/api/backup")" '401'
check "login with new password" "$(curl -s -c "$J" -X POST "$B/api/auth/login" -H 'content-type: application/json' -d "{\"email\":\"$EMAIL\",\"password\":\"password456\"}")" '"ok":true'
# Two separate promises, so two separate checks: joined by an alternation, a proxy that sent the
# visitor somewhere else entirely still passed as long as it dropped the stale cookie.
BC=$(curl -s -D - -o /dev/null -b 'tc_session=a.!!!' "$B/app" | tr A-Z a-z)
check "bad cookie → redirect to /auth (not 500)" "$BC" 'location: /auth?next=%2fapp'
check "bad cookie cleared" "$BC" 'set-cookie: tc_session=;'

echo "== demo session guard"
check "signed-in user can't be swapped into demo" "$(curl -s -D - -o /dev/null -b "$J" "$B/api/auth/demo?as=admin" | tr A-Z a-z)" 'location: /demo?signedin=1'
check "cross-site demo link bounces to /demo" "$(curl -s -D - -o /dev/null -H 'sec-fetch-site: cross-site' "$B/api/auth/demo?as=admin" | tr A-Z a-z)" 'location: /demo.\?$'

echo "== rate limits"
# A source address of its own for each run of each spray. Both ceilings are per-IP and held in
# memory for the life of the server, so a second run inside the window would start part-way up the
# bucket and the exact counts below would be wrong through no fault of the limiter.
SIP="10.7.$((RANDOM%250)).$((RANDOM%250))"; LIP="10.8.$((RANDOM%250)).$((RANDOM%250))"
N=0; for i in $(seq 1 7); do R=$(curl -s -X POST "$B/api/auth/signup" -H 'content-type: application/json' -H "x-forwarded-for: $SIP" -d "{\"first\":\"A\",\"last\":\"B\",\"facility\":\"RL$TS$i\",\"email\":\"rl$TS$i@example.com\",\"password\":\"password123\"}"); echo "$R" | grep -q 'Too many' && N=$((N+1)); done
# Sign-up counts every attempt, so seven tries against a ceiling of five must be refused exactly
# twice. One refusal would mean the ceiling had crept up to six new facilities an hour per
# connection; seven would mean it now turns everybody away.
check "signup rate-limited (5/h per IP)" "$N" '^2$'
N=0; for i in $(seq 1 45); do R=$(curl -s -X POST "$B/api/auth/login" -H 'content-type: application/json' -H "x-forwarded-for: $LIP" -d "{\"email\":\"spray$i@example.com\",\"password\":\"x\"}"); echo "$R" | grep -q 'Too many' && N=$((N+1)); done
# Sign-in counts only the attempts that FAILED, and a refusal is not itself counted (lib/ratelimit.ts),
# so 45 sprayed passwords against a 40-failure ceiling must leave exactly the last 5 refused.
check "login spray limited per IP" "$N" '^5$'

echo "== ops hardening"
check "supplier" "$(mut supplier.add '{"name":"Alpha"}')" '"id"'
check "dept" "$(mut dept.save '{"name":"Ward 1","cc":"100"}')" '"ok":true'
# For every group: Sam is in Security, and everything below issues this top to him. Tagged for one
# group of nurses it would be refused at the counter as outside his staff group, and the hand-in and
# return guards this section is about would never be reached.
check "catalog" "$(mut import.rows '{"kind":"catalog","rows":[{"item":"Uniform Top","sku":"T1","supplier":"Alpha","cost":"30","group":"All","sizes":"S|M"}]}')" '"created":1'
check "opening" "$(mut import.rows '{"kind":"opening","rows":[{"sku":"T1","size":"M","opening":"5"}]}')" '"created":1'
check "staff" "$(mut import.rows '{"kind":"staff","rows":[{"num":"1","first":"Sam","last":"Guard","group":"Security","dept":"Ward 1","ent":"3","top":"M","pants":"M"}]}')" '"created":1'
BK=$(bk); T1=$(echo "$BK" | py 'print(d["items"][0]["id"])'); SAM=$(echo "$BK" | py 'print(d["staff"][0]["id"])')
R=$(mut order.create "{\"orderFor\":\"Stock\",\"supplier\":\"Alpha\",\"lines\":[{\"itemId\":\"$T1\",\"size\":\"M\",\"qty\":4}]}"); ORD=$(echo "$R" | py 'print(d["result"]["id"])')
check "mark ordered" "$(mut order.status "{\"id\":\"$ORD\",\"status\":\"Ordered\"}")" '"ok":true'
LID=$(bk | py 'print([o for o in d["orders"] if o["id"]=="'$ORD'"][0]["lines"][0]["id"])')
check "negative invoiced cost rejected" "$(mut order.receive "{\"id\":\"$ORD\",\"lines\":[{\"lineId\":\"$LID\",\"arrived\":1,\"dest\":\"shelf\",\"cost\":-5}]}")" 'between'
check "over-delivery rejected" "$(mut order.receive "{\"id\":\"$ORD\",\"lines\":[{\"lineId\":\"$LID\",\"arrived\":9,\"dest\":\"shelf\"}]}")" 'outstanding'
check "receive ok" "$(mut order.receive "{\"id\":\"$ORD\",\"lines\":[{\"lineId\":\"$LID\",\"arrived\":4,\"dest\":\"shelf\"}]}")" '"ok":true'
check "received order locked" "$(mut order.update "{\"id\":\"$ORD\",\"ref\":\"hack\"}")" 'locked'
check "issue 1 from stock" "$(mut issue.create "{\"staffId\":\"$SAM\",\"lines\":[{\"itemId\":\"$T1\",\"si\":1,\"qty\":1,\"src\":\"stock\"}]}")" '"stock":1'
ISS=$(bk | py 'print(d["issues"][0]["id"])')
# setsBack, not good: `good` is the posted quantity echoed straight back, so it survives the
# matching loop being deleted outright. setsBack counts the garments that earned credit, and only a
# real, un-returned, non-pre-loved past issue produces one.
check "hand-in with credit (matched real issue)" "$(mut handin.add "{\"staffId\":\"$SAM\",\"credit\":true,\"lines\":[{\"itemId\":\"$T1\",\"si\":1,\"qty\":1,\"cond\":\"Good\"}]}")" '"setsBack":1'
check "credited qty recorded = 1" "$(bk | py 'print(d["handins"][0]["lines"][0]["credited"])')" '^1$'
check "return of handed-in issue refused" "$(mut issue.return "{\"id\":\"$ISS\",\"cond\":\"Returned - Good\"}")" 'handed in'
check "pre-loved issue" "$(mut issue.create "{\"staffId\":\"$SAM\",\"lines\":[{\"itemId\":\"$T1\",\"si\":1,\"qty\":1,\"src\":\"preloved\"}]}")" '"preloved":1'
# The backup lists hand-ins in no particular order, so "one of the two earned credit" was the most
# a comparison of the whole list could say — and which one is the entire point of the check. Pick
# this hand-in out by its own id instead.
H2=$(mut handin.add "{\"staffId\":\"$SAM\",\"credit\":true,\"lines\":[{\"itemId\":\"$T1\",\"si\":1,\"qty\":1,\"cond\":\"Good\"}]}")
check "hand-in of pre-loved earns no credit" "$H2" '"setsBack":0'
H2ID=$(echo "$H2" | py 'print(d["result"]["id"])')
check "pre-loved hand-in credited 0" "$(bk | py 'print([l["credited"] for h in d["handins"] if h["id"]=="'$H2ID'" for l in h["lines"]])')" '^\[0\]$'
# That hand-in took the pre-loved top back, so it cannot also be returned — counting one garment into
# the pool twice is what this used to pass on. Put one more in the pool, issue it, and return that.
mut stock.moves "{\"mode\":\"Pre-loved\",\"lines\":[{\"itemId\":\"$T1\",\"si\":1,\"qty\":1}]}" >/dev/null
check "second pre-loved issue" "$(mut issue.create "{\"staffId\":\"$SAM\",\"lines\":[{\"itemId\":\"$T1\",\"si\":1,\"qty\":1,\"src\":\"preloved\"}]}")" '"preloved":1'
PLI=$(bk | py 'print([i["id"] for i in d["issues"] if i["preloved"] and not i["handedIn"] and not i["returnedDate"]][0])')
POOL0=$(bk | py 'print(next(s["preloved"] for s in d["stock"] if s["itemId"]=="'$T1'" and s["sizeIndex"]==1))')
check "returned-good pre-loved goes back to pool" "$(mut issue.return "{\"id\":\"$PLI\",\"cond\":\"Returned - Good\"}" >/dev/null; bk | py 'print(next(s["preloved"] for s in d["stock"] if s["itemId"]=="'$T1'" and s["sizeIndex"]==1))')" "^$((POOL0+1))$"
check "add issuer" "$(mut users.add "{\"email\":\"iss$TS@example.com\",\"password\":\"password123\",\"first\":\"I\",\"last\":\"S\",\"role\":\"ISSUER\"}")" '"id"'
J2="$T/tc-sec-cj2.txt"; rm -f "$J2"; curl -s -c "$J2" -X POST "$B/api/auth/login" -H 'content-type: application/json' -d "{\"email\":\"iss$TS@example.com\",\"password\":\"password123\"}" >/dev/null
check "issuer cannot write off (Adjust)" "$(curl -s -b "$J2" -X POST "$B/api/mutate" -H 'content-type: application/json' -d "{\"op\":\"stock.moves\",\"payload\":{\"mode\":\"Adjust\",\"reason\":\"x\",\"lines\":[{\"itemId\":\"$T1\",\"si\":1,\"qty\":-3}]}}")" 'Admin only'
check "issuer can still receive" "$(curl -s -b "$J2" -X POST "$B/api/mutate" -H 'content-type: application/json' -d "{\"op\":\"stock.moves\",\"payload\":{\"mode\":\"Receive\",\"lines\":[{\"itemId\":\"$T1\",\"si\":1,\"qty\":1}]}}")" '"ok":true'
# Photos are no longer part of this: a file carrying more images than we will take back has
# them trimmed and counted rather than being refused outright, so that a room restoring a
# year of records is not left with nothing over a pile of signatures. The RECORD caps still
# refuse, and they are the ones standing between a hostile file and a million rows built in
# memory — items is checked before the envelope is even validated.
check "restore caps enforced" "$(python3 -c 'import json; print(json.dumps({"op":"backup.restore","payload":{"format":"threadcount-backup-v2","items":[{}]*5001}}))' | curl -s -b "$J" -X POST "$B/api/mutate" -H 'content-type: application/json' --data-binary @-)" 'too many items'
check "import row cap" "$(python3 -c 'import json; print(json.dumps({"op":"import.rows","payload":{"kind":"depts","rows":[{"name":"x","cc":"1"}]*20001}}))' | curl -s -b "$J" -X POST "$B/api/mutate" -H 'content-type: application/json' -d @-)" 'at most 20,000'

echo; echo "PASS=$PASS FAIL=$FAIL"; [ "$FAIL" -eq 0 ]
