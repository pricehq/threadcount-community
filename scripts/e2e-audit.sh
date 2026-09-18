#!/usr/bin/env bash
# The audit trail: that it records, that it names the actor, that it refuses non-admins, that it
# is scoped to one facility, and — the point of the whole design — that it never stores values.
set -u
B=${BASE:-http://127.0.0.1:3111}
# Refuses early, with the fix, when the server under test is in production mode with
# Turnstile refusing every auth route — otherwise the first signup fails and every check
# after it reports a security-check error instead of what it was testing.
. "$(dirname "$0")/e2e-preflight.sh"; e2e_preflight "$B"
T=${TMP:-/tmp}; J="$T/tc-aud-cj.txt"; K="$T/tc-aud-cj2.txt"; L="$T/tc-aud-cj3.txt"; rm -f "$J" "$K" "$L"
PASS=0; FAIL=0
ok()   { PASS=$((PASS+1)); echo "  ✓ $1"; }
fail() { FAIL=$((FAIL+1)); echo "  ✗ $1 :: $2"; }
mut()  { curl -s -b "$J" -c "$J" -X POST "$B/api/mutate" -H 'content-type: application/json' -d "{\"op\":\"$1\",\"payload\":$2}"; }
mut2() { curl -s -b "$K" -c "$K" -X POST "$B/api/mutate" -H 'content-type: application/json' -d "{\"op\":\"$1\",\"payload\":$2}"; }
check(){ local name=$1 out=$2 pat=$3; if echo "$out" | grep -q "$pat"; then ok "$name"; else fail "$name" "$(echo "$out" | head -c 250)"; fi; }
no()   { local name=$1 out=$2 pat=$3; if echo "$out" | grep -q "$pat"; then fail "$name" "$(echo "$out" | head -c 250)"; else ok "$name"; fi; }
log()  { curl -s -b "$J" "$B/api/activity"; }
# Signing in and signing up write the actor's name into the same facility's log, so grepping the
# whole response for a person proves nothing about the row under test. These pull one op's row out.
who_of()    { log | python3 -c "import sys,json; e=[x for x in json.load(sys.stdin)['events'] if x['op']=='$1']; print(e[0]['who'] if e else 'MISSING')"; }
target_of() { log | python3 -c "import sys,json; e=[x for x in json.load(sys.stdin)['events'] if x['op']=='$1']; print(e[0]['target'] if e else 'MISSING')"; }

TS=$(date +%s)
echo "== setup"
check "signup" "$(curl -s -c "$J" -X POST "$B/api/auth/signup" -H 'content-type: application/json' \
  -H "x-forwarded-for: 10.14.$((RANDOM%250)).$((RANDOM%250))" \
  -d "{\"first\":\"Ada\",\"last\":\"Admin\",\"facility\":\"Audit Hospital $TS\",\"email\":\"aud$TS@example.com\",\"password\":\"password123\"}")" '"ok":true'
check "the facility names its staff groups" "$(e2e_groups "$B" "$J")" '"ok":true'

echo "== a change is recorded, with who did it"
check "make a change" "$(mut supplier.add '{"name":"Alpha Supply"}')" '"id"'
check "the log has it" "$(log)" 'supplier.add'
check "and names the person" "$(who_of supplier.add)" '^Ada Admin$'

echo "== values are never stored, only identifiers"
check "add a garment with a distinctive name" "$(mut catalog.add '{"item":"Zzyzx Distinctive Gown","sku":"SECRETSKU1","supplier":"Alpha Supply","cost":99,"sizes":["S","M"]}')" '"id"'
no "the garment name is not in the log" "$(log)" 'Zzyzx'
no "the supplier code is not in the log" "$(log)" 'SECRETSKU1'
check "but the operation is" "$(log)" 'catalog.add'

echo "== a staff record's details never reach the log"
check "add a staff member" "$(mut import.rows '{"kind":"staff","rows":[{"num":"991","first":"Wilhelmina","last":"Quixotic","group":"Theatre","dept":"Ward 9Z","top":"M","pants":"M"}]}')" '"created":1'
no "no first name in the log" "$(log)" 'Wilhelmina'
no "no surname in the log" "$(log)" 'Quixotic'
# Both of those are satisfied just as well by an import that was never logged at all — and this is
# the bulk path, the op most likely to be quietly added to the skip list in lib/audit.ts one day.
check "but the operation is" "$(log)" 'import.rows'

echo "== identifiers are kept so a change can be traced"
ITEM=$(curl -s -b "$J" "$B/api/backup" | python3 -c "import sys,json; d=json.load(sys.stdin); print([i['id'] for i in d['items'] if i['sku']=='SECRETSKU1'][0])")
# Without this the id is the empty string, every grep for it matches everything, and a broken
# backup or an expired session would be reported as a change that was successfully traced.
[ -n "$ITEM" ] || { fail "found the garment id" "backup returned no id for SECRETSKU1"; echo; echo "PASS=$PASS FAIL=$FAIL"; exit 1; }
check "edit the garment" "$(mut catalog.update "{\"id\":\"$ITEM\",\"cost\":101}")" '"ok":true'
check "the record id is in the log" "$(target_of catalog.update)" "\"id\":\"$ITEM\""

echo "== an issuer cannot read the log"
check "invite an issuer" "$(mut users.add "{\"email\":\"audiss$TS@example.com\",\"first\":\"Ivan\",\"last\":\"Issuer\",\"role\":\"ISSUER\",\"password\":\"password123\"}")" '"id"'
check "issuer signs in" "$(curl -s -c "$K" -X POST "$B/api/auth/login" -H 'content-type: application/json' -d "{\"email\":\"audiss$TS@example.com\",\"password\":\"password123\"}")" '"ok":true'
check "issuer is refused the log" "$(curl -s -b "$K" "$B/api/activity")" 'Admin only'
# A title the account did not already have, so this is a real change rather than a write-back of the
# values users.add gave it — and a word worth grepping for afterwards, since it must not be kept.
check "an issuer's own change succeeds" "$(mut2 me.profile '{"title":"Store Issuer Zzq"}')" '"result":{"ok":true}'
OPS=$(log | python3 -c "import sys,json; print(' '.join(x['op'] for x in json.load(sys.stdin)['events']))")
check "an issuer's own change is still recorded" "$OPS" 'me.profile'
check "and attributed to them" "$(who_of me.profile)" '^Ivan Issuer$'
no "and the title they typed is not in the log" "$(log)" 'Zzq'

echo "== the log is scoped to one facility"
check "a second facility signs up" "$(curl -s -c "$L" -X POST "$B/api/auth/signup" -H 'content-type: application/json' \
  -H "x-forwarded-for: 10.15.$((RANDOM%250)).$((RANDOM%250))" \
  -d "{\"first\":\"Bob\",\"last\":\"Other\",\"facility\":\"Other Hospital $TS\",\"email\":\"oth$TS@example.com\",\"password\":\"password123\"}")" '"ok":true'
# An error body, a cookie jar that was never written and an empty page all contain no "Ada Admin"
# either, so prove the second admin got a readable log of their own before reading anything into
# what is missing from it.
OTHER=$(curl -s -b "$L" "$B/api/activity")
check "the other facility can read its own log" "$OTHER" 'auth:signup'
check "and it names Bob" "$OTHER" 'Bob Other'
no "the other facility cannot see our events" "$OTHER" 'Ada Admin'

echo "== unauthenticated access"
check "signed out is refused" "$(curl -s "$B/api/activity")" 'Not signed in'

echo; echo "PASS=$PASS FAIL=$FAIL"; [ "$FAIL" -eq 0 ]
