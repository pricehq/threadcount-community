#!/usr/bin/env bash
# Cost history: that a price is remembered, that it records what it moved from, and that a change
# which isn't a change doesn't produce a row.
set -u
B=${BASE:-http://127.0.0.1:3111}
# Refuses early, with the fix, when the server under test is in production mode with
# Turnstile refusing every auth route — otherwise the first signup fails and every check
# after it reports a security-check error instead of what it was testing.
. "$(dirname "$0")/e2e-preflight.sh"; e2e_preflight "$B"
T=${TMP:-/tmp}; J="$T/tc-cost-cj.txt"; rm -f "$J"
PASS=0; FAIL=0
ok()   { PASS=$((PASS+1)); echo "  ✓ $1"; }
fail() { FAIL=$((FAIL+1)); echo "  ✗ $1 :: $2"; }
mut()  { curl -s -b "$J" -c "$J" -X POST "$B/api/mutate" -H 'content-type: application/json' -d "{\"op\":\"$1\",\"payload\":$2}"; }
check(){ local name=$1 out=$2 pat=$3; if echo "$out" | grep -q "$pat"; then ok "$name"; else fail "$name" "$(echo "$out" | head -c 250)"; fi; }
py()   { python3 -c "import sys,json; d=json.load(sys.stdin); $1"; }
bk()   { curl -s -b "$J" "$B/api/backup"; }
costs(){ curl -s -b "$J" "$B/m/catalogue" > /dev/null; bk; }

TS=$(date +%s)
echo "== setup"
check "signup" "$(curl -s -c "$J" -X POST "$B/api/auth/signup" -H 'content-type: application/json' \
  -H "x-forwarded-for: 10.16.$((RANDOM%250)).$((RANDOM%250))" \
  -d "{\"first\":\"Cora\",\"last\":\"Cost\",\"facility\":\"Cost Hospital $TS\",\"email\":\"cost$TS@example.com\",\"password\":\"password123\"}")" '"ok":true'
check "the facility names its staff groups" "$(e2e_groups "$B" "$J")" '"ok":true'

R=$(mut catalog.add '{"item":"Priced Gown","sku":"PG1","supplier":"Alpha Supply","cost":30,"sizes":["S","M"]}')
check "garment created" "$R" '"id"'
ID=$(echo "$R" | py "print(d['result']['id'])")

# The whole history for this garment, oldest first, each row as "cost<-previous". Counting rows can
# only ever say that a row appeared; the figures in it are what finance actually reads back.
hist()     { bk | py "print(' | '.join('%g<-%s' % (c['cost'], 'none' if c['previous'] is None else '%g' % c['previous']) for c in d.get('costs',[]) if c['itemId']=='$ID'))"; }
itemcost() { bk | py "print('%g' % [i['cost'] for i in d['items'] if i['id']=='$ID'][0])"; }

echo "== the opening price is remembered"
check "the price landed on the garment" "$(itemcost)" '^30$'
# previous is null rather than a figure, which is what makes this row the start of the history
# instead of an edit somebody made on day one.
check "one opening row, at the opening price" "$(hist)" '^30<-none$'

echo "== a change records what it moved from"
check "raise the price" "$(mut catalog.update "{\"id\":\"$ID\",\"cost\":34.5}")" '"ok":true'
N1=$(bk | py "print(len([c for c in d.get('costs',[]) if c['itemId']=='$ID']))")
check "two rows now" "$N1" '^2$'
check "the latest is the new price" "$(bk | py "print([c['cost'] for c in d.get('costs',[]) if c['itemId']=='$ID'][-1])")" '34.5'
check "and remembers the old one" "$(bk | py "print([c['previous'] for c in d.get('costs',[]) if c['itemId']=='$ID'][-1])")" '^30'
check "and who changed it" "$(bk | py "print([c['byName'] for c in d.get('costs',[]) if c['itemId']=='$ID'][-1])")" 'Cora Cost'

echo "== setting the same price again is not a change"
check "save the identical price" "$(mut catalog.update "{\"id\":\"$ID\",\"cost\":34.5}")" '"ok":true'
check "no row for the identical price" "$(hist)" '^30<-none | 34\.5<-30$'

echo "== editing other fields leaves the history alone"
check "rename it" "$(mut catalog.update "{\"id\":\"$ID\",\"item\":\"Priced Gown (Blue)\"}")" '"ok":true'
check "no row for a rename" "$(hist)" '^30<-none | 34\.5<-30$'

echo "== a price drop is recorded as a drop"
check "lower the price" "$(mut catalog.update "{\"id\":\"$ID\",\"cost\":29}")" '"ok":true'
check "a third row, 34.5 down to 29" "$(hist)" '^30<-none | 34\.5<-30 | 29<-34\.5$'

echo "== a negative price is refused on an edit"
check "negative refused" "$(mut catalog.update "{\"id\":\"$ID\",\"cost\":-5}")" 'Invalid cost'
# Refused has to mean nothing was written. An error message sent after the update had already gone
# through would read exactly the same from out here, with the garment left priced at -5.
check "the price is untouched" "$(itemcost)" '^29$'
check "and the history is untouched" "$(hist)" '^30<-none | 34\.5<-30 | 29<-34\.5$'

echo "== a negative price on creation is clamped, not refused"
# catalog.add takes Math.max(0, cost) where catalog.update throws, so the two doors disagree about
# the same bad figure. Pinned here so that whichever way it is settled, it is settled deliberately.
R2=$(mut catalog.add '{"item":"Odd Gown","sku":"OG1","supplier":"Alpha Supply","cost":-5,"sizes":["S"]}')
check "creation accepted" "$R2" '"id"'
ID=$(echo "$R2" | py "print(d['result']['id'])")
check "the price is zero, not negative" "$(itemcost)" '^0$'
check "and a zero price opens no history" "$(hist)" '^$'

echo; echo "PASS=$PASS FAIL=$FAIL"; [ "$FAIL" -eq 0 ]
