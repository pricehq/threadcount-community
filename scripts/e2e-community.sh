#!/usr/bin/env bash
# The Community edition: the same server started with EDITION=community.
#
#   EDITION=community npm run dev -- -p 3112     # in another shell
#   BASE=http://127.0.0.1:3112 bash scripts/e2e-community.sh
#
# What it proves: the front door is the sign-in, not the website; sign-up works with no Turnstile;
# a facility has no staff ceiling and no plan tab (the snapshot says so); the demo is off; and
# nothing on a page loads the analytics tracker.
set -u
B=${BASE:-http://127.0.0.1:3112}
T=${TMP:-/tmp}
J="$T/tc-community.txt"; rm -f "$J"
PASS=0; FAIL=0
ok()   { PASS=$((PASS+1)); echo "  ✓ $1"; }
fail() { FAIL=$((FAIL+1)); echo "  ✗ $1 :: $(echo "$2" | head -c 240)"; }
check(){ local name=$1 out=$2 pat=$3; if echo "$out" | grep -q "$pat"; then ok "$name"; else fail "$name" "$out"; fi; }
no()   { local name=$1 out=$2 pat=$3; if echo "$out" | grep -q "$pat"; then fail "$name" "$out"; else ok "$name"; fi; }
code() { curl -s -o /dev/null -w '%{http_code}' "$@"; }
where(){ curl -s -o /dev/null -w '%{redirect_url}' "$@"; }
mut()  { curl -s -b "$J" -c "$J" -X POST "$B/api/mutate" -H 'content-type: application/json' -d "{\"op\":\"$1\",\"payload\":$2}"; }
rows() { python3 -c "import json,sys; n=int(sys.argv[1]); print(json.dumps({'kind':'staff','rows':[{'num':str(7000+i),'first':'C%d'%i,'last':'Row','group':'Kitchen','dept':'Kitchen'} for i in range(1,n+1)]}))" "$1"; }
. "$(dirname "$0")/e2e-preflight.sh"
TS=$(date +%s)

echo "== the front door"
check "/ redirects" "$(where "$B/")" '/auth'
check "health answers" "$(code "$B/api/health")" '200'
R=$(curl -s "$B/api/app-info")
check "app-info names the product" "$R" '"product":"threadcount"'
check "  and the edition" "$R" '"edition":"community"'
check "the demo is off" "$(code "$B/api/auth/demo?as=admin")" '404'
no   "the sign-in page loads no tracker" "$(curl -s "$B/auth")" 'pulse.js'
no   "  and asks nothing about plans" "$(curl -s "$B/auth?mode=signup")" 'Hosted Facility'

echo "== a facility with no ceiling and no plan"
R=$(curl -s -c "$J" -X POST "$B/api/auth/signup" -H 'content-type: application/json' -H "x-forwarded-for: 10.4.$((RANDOM%250)).$((RANDOM%250))" -d "{\"first\":\"Com\",\"last\":\"Munity\",\"facility\":\"Community $TS\",\"email\":\"community-$TS@example.com\",\"password\":\"password123\",\"plan\":\"hosted_small\"}")
check "signup with no Turnstile token" "$R" '"ok":true'
check "  groups" "$(e2e_groups "$B" "$J")" '"ok":true'
check "  61 staff import with no ceiling" "$(mut import.rows "$(rows 61)")" '"created":61'
check "  a write is never read-only" "$(mut dept.save '{"name":"Willow","cc":"CC-1"}')" '"ok":true'
R=$(curl -s -b "$J" "$B/app")
check "  the app opens" "$(code -b "$J" "$B/app")" '200'
no   "  with no plan tab" "$R" '"live":true'
check "  and the snapshot calls it Community" "$R" 'Community'
no   "  no tracker on an app screen either" "$R" 'pulse.js'

echo; echo "community: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
