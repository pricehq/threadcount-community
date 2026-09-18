#!/usr/bin/env bash
# The staff app: request → approve → fulfil, and everything that must refuse.
#
# The design rests on three separations, and most of this file exists to prove they hold:
#   · the linen room cannot approve — that is the ward's job;
#   · a manager can only see and decide requests addressed to them;
#   · a wearer can only see their own record, and nothing of the register.
set -u
B=${BASE:-http://127.0.0.1:3111}
# Refuses early, with the fix, when the server under test is in production mode with
# Turnstile refusing every auth route — otherwise the first signup fails and every check
# after it reports a security-check error instead of what it was testing.
. "$(dirname "$0")/e2e-preflight.sh"; e2e_preflight "$B"
T=${TMP:-/tmp}
C="$T/tc-sa-coord.txt"   # linen room
W="$T/tc-sa-wearer.txt"  # the staff member
M="$T/tc-sa-mgr.txt"     # their ward manager
D="$T/tc-sa-desk.txt"    # the ward clerk
O="$T/tc-sa-other.txt"   # a manager on another ward
X="$T/tc-sa-dir.txt"     # the ward manager's own manager, a level up
N="$T/tc-sa-noward.txt"  # a desk clerk whose ward was never filled in
# Three more nurses on Jamila's ward, under Jamila's manager. They are here because the server holds
# one person to twelve requests an hour — every request emails a manager, and nobody asks twelve
# times in an hour for a reason anybody would recognise. This file does, because it walks every flow
# end to end, so the sections below are spread across a ward rather than put through one nurse.
V="$T/tc-sa-trials.txt"  # the nurse whose asks are all meant to be refused
Y="$T/tc-sa-lines.txt"   # the nurse who asks for several garments at once
Z="$T/tc-sa-bags.txt"    # the nurse whose bags wait at the counter and go out on the round
K="$T/tc-sa-solo.txt"    # somebody recorded as their own manager, with nobody else under them
L="$T/tc-sa-lead.txt"    # somebody recorded as their own manager, with a report of her own
rm -f "$C" "$W" "$M" "$D" "$O" "$X" "$N" "$V" "$Y" "$Z" "$K" "$L"
PASS=0; FAIL=0
ok()   { PASS=$((PASS+1)); echo "  ✓ $1"; }
fail() { FAIL=$((FAIL+1)); echo "  ✗ $1 :: $2"; }
check(){ local name=$1 out=$2 pat=$3; if echo "$out" | grep -q "$pat"; then ok "$name"; else fail "$name" "$(echo "$out" | head -c 200)"; fi; }
no()   { local name=$1 out=$2 pat=$3; if echo "$out" | grep -q "$pat"; then fail "$name" "$(echo "$out" | head -c 200)"; else ok "$name"; fi; }
mut()  { curl -s -b "$C" -c "$C" -X POST "$B/api/mutate" -H 'content-type: application/json' -H "origin: $B" -d "{\"op\":\"$1\",\"payload\":$2}"; }
smut() { curl -s -b "$2" -c "$2" -X POST "$B/api/staff/mutate" -H 'content-type: application/json' -H "origin: $B" -d "{\"op\":\"$1\",\"payload\":$3}"; }
py()   { python3 -c "import sys,json; d=json.load(sys.stdin); $1"; }
# A screen that refuses somebody: the not-found page comes back and none of the screen's own words
# do. Deliberately not a status check -- these routes stream under a loading boundary, so the header
# is sent before the page decides, and 200 says nothing either way. Pass the cookie jar, the path,
# and a word the real screen would have rendered.
refused() { local name=$1 jar=$2 path=$3 leak=$4
  local body; body=$(curl -s -b "$jar" "$B$path")
  if ! printf '%s' "$body" | grep -q "That page isn"; then fail "$name" "no refusal: $(printf '%s' "$body" | head -c 160)"; return; fi
  if printf '%s' "$body" | grep -q "$leak"; then fail "$name" "REFUSED BUT LEAKED $leak"; return; fi
  ok "$name"
}
# Claim a staff account: generate a code as the linen room, then activate it into a jar.
claim() { local sid=$1 jar=$2 email=$3
  local code; code=$(mut staff.selfCode "{\"id\":\"$sid\"}" | py "print(d['result']['code'])")
  curl -s -c "$jar" -X POST "$B/api/staff/activate" -H 'content-type: application/json' -H "origin: $B" \
    -d "{\"agreed\":true,\"code\":\"$code\",\"email\":\"$email\",\"password\":\"wearerpass1\"}"; }

TS=$(date +%s)
CO="sa$TS@example.com"

echo "== setup"
check "linen room signs up" "$(curl -s -c "$C" -X POST "$B/api/auth/signup" -H 'content-type: application/json' \
  -H "x-forwarded-for: 10.31.$((RANDOM%250)).$((RANDOM%250))" \
  -d "{\"first\":\"Sal\",\"last\":\"Linen\",\"facility\":\"Request Hospital $TS\",\"email\":\"$CO\",\"password\":\"password123\"}")" '"ok":true'
check "the facility names its staff groups" "$(e2e_groups "$B" "$C")" '"ok":true'

WID=$(mut staff.save '{"num":"W1","first":"Jamila","last":"Wearer","group":"Registered Nurse","dept":"Rosewood Ward","top":"M","pants":"12"}' | py "print(d['result']['id'])")
MID=$(mut staff.save '{"num":"M1","first":"Dele","last":"Manager","group":"Registered Nurse","dept":"Rosewood Ward"}' | py "print(d['result']['id'])")
DID=$(mut staff.save '{"num":"D1","first":"Ade","last":"Clerk","group":"Admin","dept":"Rosewood Ward"}' | py "print(d['result']['id'])")
OID=$(mut staff.save '{"num":"O1","first":"Otto","last":"Elsewhere","group":"Security","dept":"Linden Ward"}' | py "print(d['result']['id'])")
CID=$(mut staff.save '{"num":"C1","first":"Chidi","last":"Director","group":"Registered Nurse","dept":"Rosewood Ward"}' | py "print(d['result']['id'])")
# Two people whose ward was never filled in: a desk clerk and somebody the clerk must not reach.
# Sharing a blank ward with somebody used to read as sharing a ward, which was the widest version
# of the door the desk raised through. That door is shut now, and this pair is what proves it.
NID=$(mut staff.save '{"num":"N1","first":"Nia","last":"Nodesk","group":"Admin"}' | py "print(d['result']['id'])")
PID=$(mut staff.save '{"num":"P1","first":"Pat","last":"Noward","group":"Registered Nurse"}' | py "print(d['result']['id'])")
# Counted, not concatenated: an id that came back empty because staff.save refused is exactly what
# makes the refusals further down pass for the wrong reason, since a blank subjectId falls into a
# different branch of request.create entirely.
check "seven people on the register" "$(printf '%s\n' "$WID" "$MID" "$DID" "$OID" "$CID" "$NID" "$PID" | grep -c .)" '^7$'

check "the wearer gets a manager" "$(mut staff.patch "{\"id\":\"$WID\",\"managerId\":\"$MID\"}")" '"ok":true'
check "so does the clerk" "$(mut staff.patch "{\"id\":\"$DID\",\"managerId\":\"$MID\"}")" '"ok":true'
check "and the ward-less nurse" "$(mut staff.patch "{\"id\":\"$PID\",\"managerId\":\"$MID\"}")" '"ok":true'
check "the clerk is put on the desk" "$(mut staff.patch "{\"id\":\"$DID\",\"wardDesk\":true}")" '"ok":true'
check "so is the one with no ward" "$(mut staff.patch "{\"id\":\"$NID\",\"wardDesk\":true}")" '"ok":true'
# Anybody may be their own manager now (the owner's decision, 12 September 2026) — that is proved on
# people of its own further down, so Jamila keeps Dele. What is still refused is a manager who is not
# on the register at all, and refusing it must leave her manager where it was.
check "a manager nobody on the register is refused" "$(mut staff.patch "{\"id\":\"$WID\",\"managerId\":\"nope\"}")" 'Unknown staff member'
check "  and the wearer keeps the one she has" "$(curl -s -b "$C" "$B/api/backup" | py "print([s['managerId'] for s in d['staff'] if s['id']=='$WID'][0] == '$MID')")" '^True$'

# The three whose sections come later. On Jamila's ward, so the desk can sign for their bags on the
# round, and under Jamila's manager, so a request of theirs is decided exactly as one of hers is.
VID=$(mut staff.save '{"num":"W2","first":"Bea","last":"Trials","group":"Registered Nurse","dept":"Rosewood Ward","top":"S","pants":"10"}' | py "print(d['result']['id'])")
YID=$(mut staff.save '{"num":"W3","first":"Rafa","last":"Lines","group":"Registered Nurse","dept":"Rosewood Ward","top":"L","pants":"14"}' | py "print(d['result']['id'])")
ZID=$(mut staff.save '{"num":"W4","first":"Ines","last":"Trolley","group":"Registered Nurse","dept":"Rosewood Ward","top":"M","pants":"12"}' | py "print(d['result']['id'])")
check "three more nurses on the ward" "$(printf '%s\n' "$VID" "$YID" "$ZID" | grep -c .)" '^3$'
check "  all three under the same manager" "$(printf '%s\n' \
  "$(mut staff.patch "{\"id\":\"$VID\",\"managerId\":\"$MID\"}")" \
  "$(mut staff.patch "{\"id\":\"$YID\",\"managerId\":\"$MID\"}")" \
  "$(mut staff.patch "{\"id\":\"$ZID\",\"managerId\":\"$MID\"}")" | grep -c '"ok":true')" '^3$'

# 143 rather than a dozen, and deliberately not a number that is also one of the sizes: the shelf
# check below proves the count never reaches the ward, and it can only prove that against a figure
# that has no other reason to be on the page.
ITEM=$(mut catalog.add '{"item":"Navy tunic","type":"Tunic","sizes":["10","12","14"],"cost":30,"opening":[{"si":1,"qty":143},{"si":2,"qty":1}]}')
IID=$(echo "$ITEM" | py "print(d['result']['id'])")
check "a garment is on the shelf" "$ITEM" '"id"'
check "with a par level on the thin size" "$(mut stock.reorder "{\"itemId\":\"$IID\",\"si\":2,\"reorder\":3}")" '"ok":true'
# Two more garments, so one request can carry three of them and a decline can be told apart from
# an approval by which shelf moved.
TID=$(mut catalog.add '{"item":"Navy trousers","type":"Trousers","sizes":["10","12","14"],"cost":22,"opening":[{"si":0,"qty":6}]}' | py "print(d['result']['id'])")
FID=$(mut catalog.add '{"item":"Fleece jacket","type":"Fleece","sizes":["S","M","L"],"cost":48,"opening":[{"si":0,"qty":5}]}' | py "print(d['result']['id'])")
check "and two more beside it" "$(printf '%s\n' "$TID" "$FID" | grep -c .)" '^2$'

check "the wearer claims an account" "$(claim "$WID" "$W" "w$TS@example.com")" '"ok":true'
check "the manager claims one" "$(claim "$MID" "$M" "m$TS@example.com")" '"ok":true'
check "the clerk claims one" "$(claim "$DID" "$D" "d$TS@example.com")" '"ok":true'
check "the other ward claims one" "$(claim "$OID" "$O" "o$TS@example.com")" '"ok":true'
check "the director claims one" "$(claim "$CID" "$X" "c$TS@example.com")" '"ok":true'
check "the ward-less clerk claims one" "$(claim "$NID" "$N" "n$TS@example.com")" '"ok":true'
check "the nurse whose asks are refused claims one" "$(claim "$VID" "$V" "v$TS@example.com")" '"ok":true'
check "the several-garments nurse too" "$(claim "$YID" "$Y" "y$TS@example.com")" '"ok":true'
check "and the one whose bags go out" "$(claim "$ZID" "$Z" "z$TS@example.com")" '"ok":true'

echo "== the two doors into the staff app"
check "/api/staff/mutate refuses an anonymous caller" "$(curl -s -X POST "$B/api/staff/mutate" -H 'content-type: application/json' -H "origin: $B" -d '{}')" 'Not signed in'
# /api/staff/decide is the one route with no session behind it by design — the manager taps the
# button in their mail client, signed out — so refusing an anonymous caller is not a property it
# has. Its gate is the token, and a POST carrying none gets the same answer a spent link does.
check "and /api/staff/decide refuses one with no token" "$(curl -s -X POST "$B/api/staff/decide" -H 'content-type: application/json' -H "origin: $B" -d '{"action":"approve"}')" 'expired'

echo "== wards see words, never counts"
SHELF=$(curl -s -b "$W" "$B/my/shelf")
check "the shelf check renders" "$SHELF" 'Navy tunic'
check "and says In stock" "$SHELF" 'In stock'
check "and Low for the thin size" "$SHELF" '>Low<'
# A detail screen: a back chevron and no tab bar. Drawn there, the bar marked none of the five tabs
# as current, which tells a screen reader the app is on no tab at all.
no "  and the shelf draws no tab bar" "$SHELF" 'aria-label="Main"'
# A leak would put the figure itself in a size row, in whatever wording the day's code happened to
# use, so the check is the number rather than a sentence somebody would have had to write first.
#
# Read off the words on the page and nothing else. The response also carries the framework's own
# payload — a wall of build ids and hashed chunk names — and three digits turn up somewhere in that
# by luck often enough, which reports the ward leaking stock counts on a day when nothing changed.
# The screen is rendered on the server, so everything a nurse can see is in the text once the
# scripts and the mark-up are taken out, and nothing incidental is.
WORDS=$(echo "$SHELF" | python3 -c "
import re, sys
html = re.sub(r'(?is)<(script|style)[^>]*>.*?</\1>', ' ', sys.stdin.read())
print(re.sub(r'(?s)<[^>]*>', ' ', html))
")
# An empty read would make the line below pass without looking at anything.
check "  and the size rows are what we are reading" "$WORDS" 'Navy tunic'
no "and never a bare count of the shelf" "$WORDS" '\b143\b'

echo "== raising a request"
REQ=$(smut request.create "$W" "{\"lines\":[{\"itemId\":\"$IID\",\"si\":1,\"qty\":2}],\"reason\":\"Worn out\",\"note\":\"Both worn through\"}")
check "the wearer can raise one" "$REQ" '"code"'
RID=$(echo "$REQ" | py "print(d['result']['id'])")
check "and it names the approver" "$REQ" 'Dele Manager'
no "  and nothing was escalated" "$REQ" '"escalated":true'
check "an unknown garment is refused" "$(smut request.create "$W" '{"lines":[{"itemId":"nope","si":0,"qty":1}]}')" "isn't available"
check "a size that doesn't exist is refused" "$(smut request.create "$W" "{\"lines\":[{\"itemId\":\"$IID\",\"si\":99,\"qty\":1}]}")" 'Pick a size'
check "somebody with no manager cannot raise" "$(smut request.create "$O" "{\"lines\":[{\"itemId\":\"$IID\",\"si\":1,\"qty\":1}]}")" "manager isn't set"

echo "== what may go on one request"
# Bea's section: six asks in a row, all but the last meant to be refused. A refused ask counts
# against the hourly ceiling exactly as a kept one does — it has to, since a phone stuck in a retry
# loop sends nothing but refusals — so this is somebody's own morning rather than Jamila's.
check "a request with no garments is refused" "$(smut request.create "$V" '{"lines":[]}')" 'at least one garment'
check "so is one with nothing but a reason" "$(smut request.create "$V" '{"reason":"Lost"}')" 'at least one garment'
check "none of a garment is refused" "$(smut request.create "$V" "{\"lines\":[{\"itemId\":\"$IID\",\"si\":1,\"qty\":0}]}")" 'between 1 and 20'
check "and a wild quantity is too" "$(smut request.create "$V" "{\"lines\":[{\"itemId\":\"$IID\",\"si\":1,\"qty\":99}]}")" 'between 1 and 20'
# Eleven lines, built rather than typed out, so the cap is read from the refusal and not from here.
ELEVEN=$(python3 -c "import json;print(json.dumps([{'itemId':'$IID','si':i%3,'qty':1} for i in range(11)]))")
check "an eleventh garment is refused" "$(smut request.create "$V" "{\"lines\":$ELEVEN}")" 'up to 10 garments'
# The same garment and size twice is one line with the quantities added, not two rows the manager
# has to decide twice and the linen room has to pick twice.
DUP=$(smut request.create "$V" "{\"lines\":[{\"itemId\":\"$IID\",\"si\":1,\"qty\":1},{\"itemId\":\"$IID\",\"si\":1,\"qty\":2}],\"reason\":\"Extra for shifts\"}")
DUPID=$(echo "$DUP" | py "print(d['result']['id'])")
DUPROW=$(curl -s -b "$C" "$B/api/requests" | py "print(json.dumps([r for r in d['requests'] if r['id']=='$DUPID'][0]))")
check "a repeated garment becomes one line" "$(echo "$DUPROW" | py "print(d['lineCount'])")" '^1$'
check "  carrying the total" "$(echo "$DUPROW" | py "print(d['lines'][0]['qty'])")" '^3$'
check "tidied away again" "$(mut request.withdraw "{\"id\":\"$DUPID\",\"reason\":\"Raised in error\"}")" '"ok":true'

echo "== the linen room cannot approve"
check "no pick before approval" "$(mut request.pick "{\"id\":\"$RID\"}")" "can't move"
LR=$(curl -s -b "$C" "$B/api/requests")
check "it is visible to the linen room" "$LR" "$RID"
check "  shown as awaiting" "$LR" '"status":"awaiting"'

echo "== only the addressed manager can decide"
check "another ward's manager cannot approve" "$(smut request.approve "$O" "{\"id\":\"$RID\"}")" 'No such request'
check "the wearer cannot approve their own" "$(smut request.approve "$W" "{\"id\":\"$RID\"}")" 'No such request'
check "a decline with no reason is refused" "$(smut request.decline "$M" "{\"id\":\"$RID\"}")" 'Pick a reason'
check "a made-up reason is refused" "$(smut request.decline "$M" "{\"id\":\"$RID\",\"reason\":\"Because\"}")" 'Pick a reason'
APPROVED=$(smut request.approve "$M" "{\"id\":\"$RID\"}")
check "the manager approves" "$APPROVED" '"status":"accepted"'
# The other half of the self-approval marking further down: a manager deciding somebody else's
# request is never handed back as having approved their own.
check "  as an ordinary approval, not a self-approval" "$APPROVED" '"selfApproved":false'
check "and cannot approve twice" "$(smut request.approve "$M" "{\"id\":\"$RID\"}")" 'already been decided'
check "nor decline after approving" "$(smut request.decline "$M" "{\"id\":\"$RID\",\"reason\":\"Over allowance\"}")" 'already been decided'

echo "== fulfilment is the linen room's"
check "the manager cannot pick" "$(smut request.pick "$M" "{\"id\":\"$RID\"}")" 'Unknown action'
# Nothing can be handed over before it is picked. (Picking straight to collected is allowed: the
# counter phone picks and hands over in one visit, signed at the window.)
check "collected is refused out of order" "$(mut request.collected "{\"id\":\"$RID\"}")" "can't move"
check "the linen room picks" "$(mut request.pick "{\"id\":\"$RID\"}")" '"status":"picking"'
HOLD=$(mut request.hold "{\"id\":\"$RID\",\"holdUntil\":\"Fri 6pm\"}")
check "held at the counter" "$HOLD" '"status":"ready"'
ORDER=$(curl -s -b "$W" "$B/my/orders/$RID")
check "the wearer sees a collection code" "$ORDER" 'Show at the counter'
check "and the hold" "$ORDER" 'Fri 6pm'
check "and the timeline names the approver" "$ORDER" 'Approved by Dele Manager'
check "the linen room marks it collected" "$(mut request.collected "{\"id\":\"$RID\"}")" '"status":"collected"'

echo "== a decline carries its reason to the staff member"
R2=$(smut request.create "$Y" "{\"lines\":[{\"itemId\":\"$IID\",\"si\":2,\"qty\":1}],\"reason\":\"Lost\"}" | py "print(d['result']['id'])")
DEC2=$(smut request.decline "$M" "{\"id\":\"$R2\",\"reason\":\"Over allowance\"}")
check "declined with a reason" "$DEC2" '"status":"declined"'
# One garment, so the summary says Declined outright rather than counting it out as 1 of 1.
check "  and summarised without arithmetic" "$DEC2" '"summary":"Declined"'
D2=$(curl -s -b "$Y" "$B/my/orders/$R2")
check "the wearer is told which one" "$D2" 'Over allowance'
check "and who decided" "$D2" 'Dele Manager'
R2ROW=$(curl -s -b "$C" "$B/api/requests" | py "print(json.dumps([r for r in d['requests'] if r['id']=='$R2'][0]))")
check "the garment under it was refused too" "$(echo "$R2ROW" | py "print(d['lines'][0]['status'])")" '^declined$'
check "  and carries the same reason" "$(echo "$R2ROW" | py "print(d['lines'][0]['declineReason'])")" '^Over allowance$'

echo "== one request, three garments, one decision"
# The whole point of lines. A nurse who needs a tunic, trousers and a fleece asks once; the manager
# reads the lot on one screen and answers in one action, but can knock back a single garment. Only
# what survives that is picked, bagged and handed over, and the refusal stays on the record so the
# wearer can see what happened to the fleece.
ML=$(smut request.create "$Y" "{\"lines\":[{\"itemId\":\"$IID\",\"si\":1,\"qty\":2},{\"itemId\":\"$TID\",\"si\":0,\"qty\":1},{\"itemId\":\"$FID\",\"si\":0,\"qty\":1}],\"reason\":\"Worn out\",\"note\":\"Starting on nights\"}")
check "three garments go on one request" "$ML" '"code"'
MLID=$(echo "$ML" | py "print(d['result']['id'])")
ROW=$(curl -s -b "$C" "$B/api/requests" | py "print(json.dumps([r for r in d['requests'] if r['id']=='$MLID'][0]))")
check "  three lines on it" "$(echo "$ROW" | py "print(d['lineCount'])")" '^3$'
check "  four garments between them" "$(echo "$ROW" | py "print(d['garments'])")" '^4$'
check "  and a one-liner for a collapsed row" "$(echo "$ROW" | py "print(d['summary'])")" '4 garments · Navy tunic, Navy trousers, Fleece jacket'
check "  with nothing decided yet" "$(echo "$ROW" | py "print(d['decision'] or 'undecided')")" '^undecided$'
L1=$(echo "$ROW" | py "print(d['lines'][0]['id'])")
L2=$(echo "$ROW" | py "print(d['lines'][1]['id'])")
L3=$(echo "$ROW" | py "print(d['lines'][2]['id'])")

# A half-answered decision would send a bag to the counter with a garment nobody had ruled on.
check "leaving a garment undecided is refused" "$(smut request.approve "$M" "{\"id\":\"$MLID\",\"lines\":[{\"id\":\"$L1\",\"decision\":\"approved\"},{\"id\":\"$L2\",\"decision\":\"approved\"}]}")" 'Decide every garment'
check "an id that is not on the request is refused" "$(smut request.approve "$M" "{\"id\":\"$MLID\",\"lines\":[{\"id\":\"$L1\",\"decision\":\"approved\"},{\"id\":\"$L2\",\"decision\":\"approved\"},{\"id\":\"rl_nonsense\",\"decision\":\"approved\"}]}")" "doesn.t match the request"
# "accepted" is the word for a whole request; a garment is "approved". Conflating the two would let
# a typo through as a decision nobody made.
check "the request-level word is not a line's word" "$(smut request.approve "$M" "{\"id\":\"$MLID\",\"lines\":[{\"id\":\"$L1\",\"decision\":\"accepted\"},{\"id\":\"$L2\",\"decision\":\"approved\"},{\"id\":\"$L3\",\"decision\":\"approved\"}]}")" 'Approve or decline each garment'
check "a declined garment needs a reason" "$(smut request.approve "$M" "{\"id\":\"$MLID\",\"lines\":[{\"id\":\"$L1\",\"decision\":\"approved\"},{\"id\":\"$L2\",\"decision\":\"approved\"},{\"id\":\"$L3\",\"decision\":\"declined\"}]}")" 'Pick a reason for each garment'
check "and it has to be one of the reasons" "$(smut request.approve "$M" "{\"id\":\"$MLID\",\"lines\":[{\"id\":\"$L1\",\"decision\":\"approved\"},{\"id\":\"$L2\",\"decision\":\"approved\"},{\"id\":\"$L3\",\"decision\":\"declined\",\"reason\":\"Because\"}]}")" 'Pick a reason for each garment'
check "none of that decided anything" "$(curl -s -b "$C" "$B/api/requests" | py "print([r for r in d['requests'] if r['id']=='$MLID'][0]['status'])")" '^awaiting$'

DEC=$(smut request.approve "$M" "{\"id\":\"$MLID\",\"lines\":[{\"id\":\"$L1\",\"decision\":\"approved\"},{\"id\":\"$L2\",\"decision\":\"approved\"},{\"id\":\"$L3\",\"decision\":\"declined\",\"reason\":\"Over allowance\"}]}")
check "two approved, one declined" "$DEC" '"status":"accepted"'
check "  summarised in one line" "$DEC" '"summary":"2 of 3 approved"'
check "and the decision is only made once" "$(smut request.decline "$M" "{\"id\":\"$MLID\",\"reason\":\"Over allowance\"}")" 'already been decided'

ROW2=$(curl -s -b "$C" "$B/api/requests" | py "print(json.dumps([r for r in d['requests'] if r['id']=='$MLID'][0]))")
check "one surviving garment makes the request accepted" "$(echo "$ROW2" | py "print(d['status'])")" '^accepted$'
check "  the record still holds all three" "$(echo "$ROW2" | py "print(d['lineCount'])")" '^3$'
check "  the bag holds two" "$(echo "$ROW2" | py "print(len(d['bag']))")" '^2$'
check "  three garments to pick" "$(echo "$ROW2" | py "print(d['garments'])")" '^3$'
no "  and the fleece is not one of them" "$(echo "$ROW2" | py "print(json.dumps(d['bag']))")" 'Fleece jacket'
check "the refused line says what it was" "$(echo "$ROW2" | py "print([l for l in d['lines'] if l['item']=='Fleece jacket'][0]['status'])")" '^declined$'
check "  and carries its own reason" "$(echo "$ROW2" | py "print([l for l in d['lines'] if l['item']=='Fleece jacket'][0]['declineReason'])")" '^Over allowance$'
check "  and is worded for the wearer" "$(echo "$ROW2" | py "print([l for l in d['lines'] if l['item']=='Fleece jacket'][0]['statusLabel'])")" '^Declined$'
check "  while the approved lines carry no reason" "$(echo "$ROW2" | py "print(len([l for l in d['bag'] if l['declineReason']]))")" '^0$'
# One refusal out of three is not a refusal of the request, so no reason is invented for it.
check "the request itself is given no reason" "$(echo "$ROW2" | py "print(d['declineReason'] or 'none')")" '^none$'
MLORDER=$(curl -s -b "$Y" "$B/my/orders/$MLID")
check "the wearer's order names the refused garment" "$MLORDER" 'Fleece jacket'
check "  with the reason against it" "$MLORDER" 'Over allowance'
check "  and still lists what is coming" "$MLORDER" 'Navy trousers'

echo "== only what was approved leaves the shelf"
TUNIC_BEFORE=$(curl -s -b "$C" "$B/api/backup" | py "print(sum(i['qty'] for i in d['issues'] if i['itemId']=='$IID' and i['sizeIndex']==1))")
check "the linen room picks the bag" "$(mut request.pick "{\"id\":\"$MLID\"}")" '"status":"picking"'
check "and holds it at the counter" "$(mut request.hold "{\"id\":\"$MLID\",\"holdUntil\":\"Tue 2pm\"}")" '"status":"ready"'
MLCODE=$(curl -s -b "$C" "$B/api/requests" | py "print([r for r in d['requests'] if r['id']=='$MLID'][0]['collectCode'])")
check "one collection code, for the whole request" "$MLCODE" '^[0-9][0-9][0-9][0-9]$'
READY=$(curl -s -b "$Y" "$B/my/orders/$MLID")
check "  and the wearer is pointed at the counter" "$READY" 'Show at the counter'
check "  under the code the linen room is holding" "$READY" "$MLCODE"
# Three garments, two lines, one bag. The screen says so in words, because somebody who asked for
# three things and is given one code will otherwise assume the rest is coming separately.
# React's server renderer puts an empty comment between a literal and an interpolated value, so
# this sentence reaches the browser as `All <!-- -->3<!-- --> garments...`. Read it with the
# separators taken out, or the check hunts for a string the server has never once sent.
READY_TEXT=$(printf '%s' "$READY" | sed 's/<!-- -->//g')
check "  said to cover the whole bag" "$READY_TEXT" 'All 3 garments are in one bag'
check "  covering the tunics" "$READY" 'Navy tunic'
check "  and the trousers with them" "$READY" 'Navy trousers'
check "the linen room hands the bag over" "$(mut request.collected "{\"id\":\"$MLID\"}")" '"status":"collected"'
BK=$(curl -s -b "$C" "$B/api/backup")
check "both tunics came off the shelf" "$(echo "$BK" | py "print(sum(i['qty'] for i in d['issues'] if i['itemId']=='$IID' and i['sizeIndex']==1) - $TUNIC_BEFORE)")" '^2$'
check "and the trousers with them" "$(echo "$BK" | py "print(sum(i['qty'] for i in d['issues'] if i['itemId']=='$TID'))")" '^1$'
check "the fleece never moved" "$(echo "$BK" | py "print(len([i for i in d['issues'] if i['itemId']=='$FID']))")" '^0$'
check "nor was one ordered to replace it" "$(echo "$BK" | py "print(len([l for o in d['orders'] for l in o['lines'] if l['itemId']=='$FID']))")" '^0$'
check "  while the trousers were" "$(echo "$BK" | py "print(sum(l['qty'] for o in d['orders'] for l in o['lines'] if l['itemId']=='$TID'))")" '^1$'
check "the hand-over was one event, under the one code" "$(curl -s -b "$C" "$B/api/requests" | py "print([r for r in d['requests'] if r['id']=='$MLID'][0]['events'][-1]['meta'])")" "^Code $MLCODE\$"

echo "== two bags at the counter never share a code"
# The whole transaction at the counter is somebody reading four digits off their phone and the
# coordinator finding the bag with that number on it, so two bags waiting at once under the same
# number is somebody being handed the wrong uniform. Uniqueness is only asked of the bags actually
# out there — a code goes back in the pot once its bag has gone home — which is why both of these
# are held before either is checked.
CA=$(smut request.create "$Z" "{\"lines\":[{\"itemId\":\"$IID\",\"si\":1,\"qty\":1}],\"reason\":\"Worn out\"}" | py "print(d['result']['id'])")
CB=$(smut request.create "$Z" "{\"lines\":[{\"itemId\":\"$TID\",\"si\":0,\"qty\":1}],\"reason\":\"Worn out\"}" | py "print(d['result']['id'])")
check "the manager approves the first" "$(smut request.approve "$M" "{\"id\":\"$CA\"}")" '"status":"accepted"'
check "  and the second" "$(smut request.approve "$M" "{\"id\":\"$CB\"}")" '"status":"accepted"'
check "the first is picked" "$(mut request.pick "{\"id\":\"$CA\"}")" '"status":"picking"'
check "  and held at the counter" "$(mut request.hold "{\"id\":\"$CA\",\"holdUntil\":\"Thu 5pm\"}")" '"status":"ready"'
check "the second is picked" "$(mut request.pick "{\"id\":\"$CB\"}")" '"status":"picking"'
check "  and held beside it" "$(mut request.hold "{\"id\":\"$CB\",\"holdUntil\":\"Thu 5pm\"}")" '"status":"ready"'
# Looked up by id, one field each, rather than filtered into a list: a bag that never got as far as
# the counter has to read as missing. Filtering shortened the list instead, and a lone code beside
# an empty second field then compared as two codes that differ, which is the one answer this pair
# of lines exists to rule out.
PAIR=$(curl -s -b "$C" "$B/api/requests" | py "codes={r['id']: (r['collectCode'] or 'none') for r in d['requests']}; print(codes.get('$CA','missing'), codes.get('$CB','missing'))")
check "both bags carry a code" "$PAIR" '^[0-9][0-9][0-9][0-9] [0-9][0-9][0-9][0-9]$'
check "  and the two are not the same one" "$(echo "$PAIR" | awk '{ if ($1 !~ /^[0-9][0-9][0-9][0-9]$/ || $2 !~ /^[0-9][0-9][0-9][0-9]$/) print "not two codes: " $0; else if ($1 == $2) print "the same"; else print "different" }')" '^different$'
check "the first goes home" "$(mut request.collected "{\"id\":\"$CA\"}")" '"status":"collected"'
check "  and the second after it" "$(mut request.collected "{\"id\":\"$CB\"}")" '"status":"collected"'

echo "== the emailed link renders, the button decides"
# Two garments on this one deliberately. The email has no room for a garment-by-garment answer —
# it is one button — so approving through it has to settle every line on the request. A link that
# moved the request to accepted while its lines sat at awaiting would hand the linen room a pick
# list with nothing on it.
R3=$(smut request.create "$Z" "{\"lines\":[{\"itemId\":\"$IID\",\"si\":1,\"qty\":1},{\"itemId\":\"$TID\",\"si\":0,\"qty\":1}],\"reason\":\"Damaged\"}" | py "print(d['result']['id'])")
TOKEN=$(node scripts/approval-mint.cjs "$R3" "$MID" 2>/dev/null)
check "a token can be minted for the test" "$TOKEN" '.'
PAGE=$(curl -s "$B/my/approve?t=$TOKEN")
check "the link opens a page, signed out" "$PAGE" 'needs your approval'
check "  listing every garment on the ask" "$PAGE" 'Navy trousers'
check "  which says nothing is decided yet" "$PAGE" 'Nothing has been decided yet'
STILL=$(curl -s -b "$C" "$B/api/requests")
check "  and rendering it decided nothing" "$(echo "$STILL" | py "print([r for r in d['requests'] if r['id']=='$R3'][0]['status'])")" '^awaiting$'
check "a garbage token is refused" "$(curl -s -X POST "$B/api/staff/decide" -H 'content-type: application/json' -H "origin: $B" -d '{"token":"nope.nope","action":"approve"}')" 'expired'
check "the POST decides" "$(curl -s -X POST "$B/api/staff/decide" -H 'content-type: application/json' -H "origin: $B" -d "{\"token\":\"$TOKEN\",\"action\":\"approve\"}")" '"status":"accepted"'
check "and the same link will not decide twice" "$(curl -s -X POST "$B/api/staff/decide" -H 'content-type: application/json' -H "origin: $B" -d "{\"token\":\"$TOKEN\",\"action\":\"decline\",\"reason\":\"Over allowance\"}")" 'already been decided'
R3ROW=$(curl -s -b "$C" "$B/api/requests" | py "print(json.dumps([r for r in d['requests'] if r['id']=='$R3'][0]))")
check "the one button settled both garments" "$(echo "$R3ROW" | py "print(len([l for l in d['lines'] if l['status']=='approved']))")" '^2$'
check "  so the whole ask is in the bag" "$(echo "$R3ROW" | py "print(len(d['bag']))")" '^2$'
check "  and it reads as approved outright" "$(echo "$R3ROW" | py "print(d['decision'])")" '^All 2 approved$'

echo "== the ward round, and who signed"
# Signing for a bag on the ward is the moment its garments leave the linen room's shelf, exactly as
# collecting at the counter is, so the whole approved ask has to move — not just the first line on
# it. Counted before the round and after, because the shelf is what the linen room reconciles.
ROUND_BEFORE=$(curl -s -b "$C" "$B/api/backup" | py "print(sum(i['qty'] for i in d['issues'] if i['itemId'] in ('$IID','$TID')))")
check "sent on the round" "$(mut request.pick "{\"id\":\"$R3\"}")" '"status":"picking"'
check "  routed to the ward" "$(mut request.round "{\"id\":\"$R3\"}")" '"status":"round"'
check "another ward cannot sign for it" "$(smut round.sign "$O" "{\"id\":\"$R3\"}")" 'another ward'
check "anyone on the ward can sign" "$(smut round.sign "$D" "{\"id\":\"$R3\"}")" '"ok":true'
check "  and both garments came off the shelf with it" "$(curl -s -b "$C" "$B/api/backup" | py "print(sum(i['qty'] for i in d['issues'] if i['itemId'] in ('$IID','$TID')) - $ROUND_BEFORE)")" '^2$'
check "and not twice" "$(smut round.sign "$D" "{\"id\":\"$R3\"}")" 'No such bag'
SIGNED=$(curl -s -b "$Z" "$B/my/orders/$R3")
check "the requester is told who signed" "$SIGNED" 'Ade Clerk'
# Signing is where the linen room's job ends, not where the bag does: it then sits on the desk
# until somebody says it was picked up, and the desk's unclaimed pile only grows until they do.
# The requester, or the clerk standing next to the pile, may say so — and nobody else.
check "a stranger cannot mark it collected" "$(smut round.claim "$O" "{\"id\":\"$R3\"}")" 'somebody else'
check "the desk marks it collected" "$(smut round.claim "$D" "{\"id\":\"$R3\"}")" '"ok":true'
check "  and the requester is told who did" "$(curl -s -b "$Z" "$B/my/orders/$R3")" 'Marked by Ade Clerk'
# The requester tapping "I've got it" after the desk has already marked it must leave one claim
# and one line on the timeline, not a second one under the other name.
check "claiming it again changes nothing" "$(smut round.claim "$Z" "{\"id\":\"$R3\"}")" '"ok":true'
# One row, and still the desk's name on it: an implementation that overwrote the first claim with
# the second caller's name would also leave exactly one row, so counting them proves half of it.
check "  and the timeline says it once, in the desk's name" "$(curl -s -b "$C" "$B/api/requests" | py "e=[x for x in [r for r in d['requests'] if r['id']=='$R3'][0]['events'] if x['label']=='Collected from the ward']; print(len(e), e[0]['meta'] if e else '')")" '^1 Marked by Ade Clerk$'
R3CODE=$(curl -s -b "$C" "$B/api/requests" | py "print([r for r in d['requests'] if r['id']=='$R3'][0]['code'])")
ROUNDPAGE=$(curl -s -b "$D" "$B/my/round")
check "the desk's round screen is still there" "$ROUNDPAGE" 'Ward round'
no "  and the collected bag is off it" "$ROUNDPAGE" "$R3CODE"

echo "== the ward desk raises for nobody"
# The desk used to raise for anyone on its own ward, on the grounds that half a ward would never
# install anything. That door is shut: the only person who may put a request in somebody else's
# name is their own manager. Ade is on the desk and on Jamila's ward, and between them those two
# facts now buy her exactly what they buy an ordinary staff member.
DR=$(smut request.create "$D" "{\"subjectId\":\"$WID\",\"lines\":[{\"itemId\":\"$IID\",\"si\":1,\"qty\":1}],\"reason\":\"Extra for shifts\"}")
check "the desk cannot raise for its own ward" "$DR" "Only somebody.s own manager"
no "  and nothing is created by it" "$DR" '"code"'
check "nor for another ward" "$(smut request.create "$D" "{\"subjectId\":\"$OID\",\"lines\":[{\"itemId\":\"$IID\",\"si\":1,\"qty\":1}]}")" "Only somebody.s own manager"
check "a non-desk staff member cannot either" "$(smut request.create "$W" "{\"subjectId\":\"$DID\",\"lines\":[{\"itemId\":\"$IID\",\"si\":1,\"qty\":1}]}")" "Only somebody.s own manager"
# The widest version of that door was a blank ward: two people with nothing recorded read as
# members of the same one, which handed a clerk with an empty ward the run of every other
# ward-less person in the facility. Nia is that clerk, and Pat reports to Dele, not to her.
BLANK=$(smut request.create "$N" "{\"subjectId\":\"$PID\",\"lines\":[{\"itemId\":\"$IID\",\"si\":1,\"qty\":1}]}")
check "nor a desk clerk with no ward recorded" "$BLANK" "Only somebody.s own manager"
no "  and nothing is created by that either" "$BLANK" '"code"'
# The flag itself stays — it is what signs for a bag on the round — but the screen it used to open
# has gone from the product, for the clerk who holds the flag as much as for anybody else.
check "and the desk screen went with the door" "$(curl -s -o /dev/null -w '%{http_code}' -b "$D" "$B/my/desk")" '404'

echo "== a manager raises for their own report, and never approves it"
# New in this round: a manager may raise for the people who report to them. The catch is that the
# manager is also the person who would approve it, so the request goes a level up instead — and
# when there is nobody above, it is created with no approver at all and waits on the linen room.
#
# The screen is scoped to the reporting line, not to a ward, and it exists only for somebody who
# actually has one — an empty version of it would tell a nurse they might have a team.
refused "a wearer with nobody under them has no such screen" "$W" "/my/raise" "Who is it for"
refused "nor the ward clerk, who manages nobody either" "$D" "/my/raise" "Who is it for"
TEAM=$(curl -s -b "$M" "$B/my/raise")
check "the manager has one" "$TEAM" 'Raise for your team'
check "  listing the people who report to them" "$TEAM" 'Jamila Wearer'
no "  and nobody who doesn.t" "$TEAM" 'Otto Elsewhere'
check "and home points them at it" "$(curl -s -b "$M" "$B/my")" 'Raise for someone you manage'
SELFR=$(smut request.create "$M" "{\"subjectId\":\"$WID\",\"lines\":[{\"itemId\":\"$IID\",\"si\":1,\"qty\":1}],\"reason\":\"Worn out\"}")
check "the manager can raise for their report" "$SELFR" '"code"'
check "  and is told it was moved on" "$SELFR" '"escalated":true'
check "  with nobody above them, it has no approver" "$SELFR" '"manager":""'
SRID=$(echo "$SELFR" | py "print(d['result']['id'])")
check "  and the subject sees whose name it is in" "$(curl -s -b "$W" "$B/my/orders/$SRID")" 'Raised for you by Dele Manager'
check "so the raiser cannot approve it" "$(smut request.approve "$M" "{\"id\":\"$SRID\"}")" 'No such request'
check "nor decline it" "$(smut request.decline "$M" "{\"id\":\"$SRID\",\"reason\":\"Over allowance\"}")" 'No such request'
SROW=$(curl -s -b "$C" "$B/api/requests" | py "print(json.dumps([r for r in d['requests'] if r['id']=='$SRID'][0]))")
check "the linen room sees it waiting" "$(echo "$SROW" | py "print(d['status'])")" '^awaiting$'
check "  with nobody's name against it" "$(echo "$SROW" | py "print(d['managerName'] or 'nobody')")" '^nobody$'
check "  and the timeline says why" "$(echo "$SROW" | py "print(d['events'][0]['meta'])")" 'the linen room will address it'
check "the linen room addresses it to somebody who can decide" "$(mut request.reassign "{\"id\":\"$SRID\",\"managerId\":\"$CID\"}")" '"manager":"Chidi Director"'
check "and that manager can" "$(smut request.approve "$X" "{\"id\":\"$SRID\"}")" '"status":"accepted"'

check "the manager is given a manager of their own" "$(mut staff.patch "{\"id\":\"$MID\",\"managerId\":\"$CID\"}")" '"ok":true'
UPR=$(smut request.create "$M" "{\"subjectId\":\"$WID\",\"lines\":[{\"itemId\":\"$IID\",\"si\":1,\"qty\":1}],\"reason\":\"Worn out\"}")
check "now the same raise goes up a level" "$UPR" '"manager":"Chidi Director"'
check "  still marked as moved on" "$UPR" '"escalated":true'
no "  and never back to the raiser" "$UPR" 'Dele Manager'
UPID=$(echo "$UPR" | py "print(d['result']['id'])")
check "the raiser still cannot decide it" "$(smut request.approve "$M" "{\"id\":\"$UPID\"}")" 'No such request'
# Not deciding it is not the same as losing sight of it: whoever raised a request can follow it.
check "but can still follow it" "$(curl -s -o /dev/null -w '%{http_code}' -b "$M" "$B/my/orders/$UPID")" '200'
check "the level above declines it" "$(smut request.decline "$X" "{\"id\":\"$UPID\",\"reason\":\"Over allowance\"}")" '"status":"declined"'
check "and the wearer is told who did" "$(curl -s -b "$W" "$B/my/orders/$UPID")" 'Chidi Director'
# Somebody who does not report to you is nobody's to raise for — there is no route left that
# reaches them, so a manager gets the same sentence back as the desk does.
check "a manager still cannot raise for a stranger" "$(smut request.create "$M" "{\"subjectId\":\"$OID\",\"lines\":[{\"itemId\":\"$IID\",\"si\":1,\"qty\":1}]}")" "Only somebody.s own manager"
# A request raised for somebody else sits on nobody's own order list, so without a place of its own
# it would go quiet on the person who typed it in. Read off what was drawn rather than off what was
# sent: the screen is handed all three lists whichever tab is showing, so the subject's name is in
# the bytes of both URLs either way. "for Jamila Wearer" is composed as a row is drawn, so it only
# appears on the list the tab actually opened.
RAISED=$(curl -s -b "$M" "$B/my/orders?tab=raised")
check "what they raised for others has its own list" "$RAISED" 'for Jamila Wearer'
OWN=$(curl -s -b "$M" "$B/my/orders")
check "  and their own list opens with nothing in it" "$OWN" 'Nothing open'
no "  and it is not folded in with their own orders" "$OWN" 'for Jamila Wearer'

echo "== anybody may be their own manager"
# The owner's decision, 12 September 2026. On a facility where one person is the whole register
# there is nobody else to name, and the staff app refuses every request from somebody with no manager
# set — so anybody may be recorded as their own, and approve their own requests and signed forms.
# None of it passes unseen: every such approval is marked self-approved on the record. This replaced
# a rule that allowed it only to somebody with at least one other person reporting to them, which is
# why Kofi below has nobody under him.
KID=$(mut staff.save '{"num":"K1","first":"Kofi","last":"Solo","group":"Registered Nurse","dept":"Linden Ward","top":"M","pants":"12"}' | py "print(d['result']['id'])")
check "somebody with nobody under them" "$KID" '.'
check "  can be recorded as their own manager" "$(mut staff.patch "{\"id\":\"$KID\",\"managerId\":\"$KID\"}")" '"ok":true'
check "  and the register holds them as it" "$(curl -s -b "$C" "$B/api/backup" | py "print([s['managerId'] for s in d['staff'] if s['id']=='$KID'][0] == '$KID')")" '^True$'
check "Kofi claims an account" "$(claim "$KID" "$K" "k$TS@example.com")" '"ok":true'
# The complaint that started this: the staff app kept telling him no manager was set. Otto still has
# none, so the same sentence on his home is what proves this line is looking at the right words.
no "the staff app no longer says he has no manager" "$(curl -s -b "$K" "$B/my")" 'manager isn’t recorded yet'
check "  while somebody with none is still told" "$(curl -s -b "$O" "$B/my")" 'manager isn’t recorded yet'
# Being your own manager is not having a team: the raise-for-others screen lists the people who
# report to you, and he is not one of them.
refused "being his own manager gives him no team to raise for" "$K" "/my/raise" "Who is it for"

KR=$(smut request.create "$K" "{\"lines\":[{\"itemId\":\"$IID\",\"si\":1,\"qty\":1}],\"reason\":\"Worn out\"}")
check "he raises a request for himself" "$KR" '"code"'
check "  addressed to himself" "$KR" '"manager":"Kofi Solo"'
check "  and is told it is his to approve" "$KR" '"selfApproves":true'
no "  and it was not moved on anywhere" "$KR" '"escalated":true'
KRID=$(echo "$KR" | py "print(d['result']['id'])")
KROW=$(curl -s -b "$C" "$B/api/requests" | py "print(json.dumps([r for r in d['requests'] if r['id']=='$KRID'][0]))")
check "the linen room sees it awaiting his own approval" "$(echo "$KROW" | py "print(d['status'], d['managerId']=='$KID')")" '^awaiting True$'
check "somebody else still cannot decide it" "$(smut request.approve "$O" "{\"id\":\"$KRID\"}")" 'No such request'
# The not-found page's words ride along in every staff-app page's data, so a page that refused him
# is told apart by its status, not by its text: a refusal is a 404, the queue is a 200.
check "his approvals queue opens" "$(curl -s -o /dev/null -w '%{http_code}' -b "$K" "$B/my/approvals")" '^200$'
KQ=$(curl -s -b "$K" "$B/my/approvals")
check "  and is the queue" "$KQ" 'Approvals'
KAP=$(smut request.approve "$K" "{\"id\":\"$KRID\"}")
check "he approves it" "$KAP" '"status":"accepted"'
check "  and is told it was a self-approval" "$KAP" '"selfApproved":true'
KROW2=$(curl -s -b "$C" "$B/api/requests" | py "print(json.dumps([r for r in d['requests'] if r['id']=='$KRID'][0]))")
check "the request records him as its manager" "$(echo "$KROW2" | py "print(d['managerName'], d['managerId']=='$KID')")" '^Kofi Solo True$'
check "  and its timeline reads as his own" "$(echo "$KROW2" | py "print(d['events'][-1]['label'])")" '^Approved by Kofi Solo .* their own request$'
check "  and says self-approved in so many words" "$(echo "$KROW2" | py "print(d['events'][-1]['meta'])")" '^Self-approved'
# Read off Jamila's first request, decided by Dele: the marking belongs to self-approvals only, and
# a timeline that said it of every approval would say nothing.
RIDTL=$(curl -s -b "$C" "$B/api/requests" | py "print(' | '.join(e['label']+' / '+(e['meta'] or '') for e in [r for r in d['requests'] if r['id']=='$RID'][0]['events']))")
check "an ordinary approval's timeline" "$RIDTL" 'Approved by Dele Manager'
no "  never reads as a self-approval" "$RIDTL" 'their own request\|Self-approved'

# A signed order form for his own kit, with him as the approver. The pair staffId === byStaffId is
# the whole of the marking; a form countersigned by somebody else, beside it, must not carry it.
KA=$(mut approval.add "{\"staffId\":\"$KID\",\"byStaffId\":\"$KID\",\"sets\":\"2\",\"fte\":\"1.0\"}")
check "a signed form approved by himself is recorded" "$KA" '"id"'
check "  and handed back as self-approved" "$KA" '"selfApproved":true'
KAID=$(echo "$KA" | py "print(d['result']['id'])")
KB=$(mut approval.add "{\"staffId\":\"$KID\",\"byStaffId\":\"$MID\",\"sets\":\"1\"}")
check "one countersigned by somebody else is recorded" "$KB" '"id"'
check "  and is not" "$KB" '"selfApproved":false'
KBID=$(echo "$KB" | py "print(d['result']['id'])")
check "the record holds him as his own approver, and only on his own form" "$(curl -s -b "$C" "$B/api/backup" | py "a={x['id']: x for x in d['approvals']}; s=a.get('$KAID'); o=a.get('$KBID'); print(bool(s) and s['staffId']=='$KID' and s['byStaffId']=='$KID', bool(o) and o['byStaffId']=='$KID')")" '^True False$'

echo "== nobody approves a raise they made for somebody else"
# The one rule that stays. Lena is her own manager and Remy reports to her, so a raise of hers for
# Remy would be addressed to Lena — and goes up a level instead. The level up is Lena again, which is
# nobody above: it lands with no approver, in Needs an approver, as a raise with nobody above does.
LDID=$(mut staff.save '{"num":"L1","first":"Lena","last":"Lead","group":"Registered Nurse","dept":"Linden Ward","top":"M","pants":"12"}' | py "print(d['result']['id'])")
RMID=$(mut staff.save '{"num":"R1","first":"Remy","last":"Report","group":"Registered Nurse","dept":"Linden Ward","top":"M","pants":"12"}' | py "print(d['result']['id'])")
check "a lead and her report are on the register" "$(printf '%s\n' "$LDID" "$RMID" | grep -c .)" '^2$'
check "  she is her own manager" "$(mut staff.patch "{\"id\":\"$LDID\",\"managerId\":\"$LDID\"}")" '"ok":true'
check "  and his" "$(mut staff.patch "{\"id\":\"$RMID\",\"managerId\":\"$LDID\"}")" '"ok":true'
check "Lena claims an account" "$(claim "$LDID" "$L" "l$TS@example.com")" '"ok":true'
LTEAM=$(curl -s -b "$L" "$B/my/raise")
check "she has a team to raise for" "$LTEAM" 'Remy Report'
# Her own request, beside the one she raises for Remy: the difference between the two is the rule.
LOWN=$(smut request.create "$L" "{\"lines\":[{\"itemId\":\"$IID\",\"si\":1,\"qty\":1}],\"reason\":\"Worn out\"}")
check "her own request lands on her" "$LOWN" '"manager":"Lena Lead"'
LOWNID=$(echo "$LOWN" | py "print(d['result']['id'])")
check "  and she may approve it" "$(smut request.approve "$L" "{\"id\":\"$LOWNID\"}")" '"selfApproved":true'
LR=$(smut request.create "$L" "{\"subjectId\":\"$RMID\",\"lines\":[{\"itemId\":\"$IID\",\"si\":1,\"qty\":1}],\"reason\":\"Worn out\"}")
check "she can raise for Remy" "$LR" '"code"'
check "  and it is moved on" "$LR" '"escalated":true'
check "  with nobody above her but herself, it has no approver" "$LR" '"manager":""'
no "  and it is never hers" "$LR" 'Lena Lead'
LRID=$(echo "$LR" | py "print(d['result']['id'])")
check "so she cannot approve it" "$(smut request.approve "$L" "{\"id\":\"$LRID\"}")" 'No such request'
check "nor decline it" "$(smut request.decline "$L" "{\"id\":\"$LRID\",\"reason\":\"Over allowance\"}")" 'No such request'
LROW=$(curl -s -b "$C" "$B/api/requests" | py "print(json.dumps([r for r in d['requests'] if r['id']=='$LRID'][0]))")
check "the linen room sees it waiting on nobody" "$(echo "$LROW" | py "print(d['status'], d['managerId'] or 'nobody', d['managerName'] or 'nobody')")" '^awaiting nobody nobody$'
check "  and the timeline says why" "$(echo "$LROW" | py "print(d['events'][0]['meta'])")" 'the linen room will address it'
check "the linen room cannot hand it back to her" "$(mut request.reassign "{\"id\":\"$LRID\",\"managerId\":\"$LDID\"}")" 'Lena raised this request'
# Sending it to Remy himself would make him its approver, and he isn't his own manager — his app
# couldn't let him decide it — so that is refused too. Only the rule for self-addressing can refuse
# this: Remy isn't the one who raised it.
check "  nor send it to Remy, who isn't his own manager" "$(mut request.reassign "{\"id\":\"$LRID\",\"managerId\":\"$RMID\"}")" 'own manager'
check "  but can address it to somebody who can decide" "$(mut request.reassign "{\"id\":\"$LRID\",\"managerId\":\"$CID\"}")" '"manager":"Chidi Director"'
check "  and that manager can" "$(smut request.approve "$X" "{\"id\":\"$LRID\"}")" '"status":"accepted"'

# Somebody who manages only themselves strands nobody by leaving the register; somebody who is also
# named by a report still does.
check "somebody who is only their own manager can leave the register" "$(mut staff.patch "{\"id\":\"$KID\",\"inactive\":true}")" '"ok":true'
check "  while one with a report still can't" "$(mut staff.patch "{\"id\":\"$LDID\",\"inactive\":true}")" 'still names Lena'

# The CSV import links managers in a second pass. A row naming its own staff number used to be
# skipped with an error; it is kept now, and a number nobody has is still an error beside it.
IMP=$(mut import.rows '{"kind":"staff","rows":[{"num":"Q1","first":"Quinn","last":"Self","group":"Registered Nurse","manager":"Q1"},{"num":"Q2","first":"Quade","last":"Nobody","group":"Registered Nurse","manager":"ZZ9"}]}')
check "an import naming a row as its own manager goes through" "$IMP" '"created":2'
check "  a manager number nobody has is still an error" "$IMP" 'no staff member with number ZZ9'
check "  and the self-named row is its own manager" "$(curl -s -b "$C" "$B/api/backup" | py "s=[s for s in d['staff'] if s['num']=='Q1']; print(bool(s) and s[0]['managerId']==s[0]['id'])")" '^True$'

echo "== the counter raises one over the desk"
# Somebody walks into the linen room without a phone, and the coordinator raises it for them. It
# takes the same list of garments the app sends, and it still goes to that person's own manager —
# a counter that could raise and approve in one move would make the approval a formality.
CR=$(mut request.raise "{\"staffId\":\"$WID\",\"lines\":[{\"itemId\":\"$IID\",\"si\":1,\"qty\":1},{\"itemId\":\"$TID\",\"si\":0,\"qty\":2}],\"reason\":\"Worn out\"}")
check "the linen room raises it" "$CR" '"code"'
check "  addressed to the wearer's own manager" "$CR" 'Dele Manager'
CRID=$(echo "$CR" | py "print(d['result']['id'])")
CRROW=$(curl -s -b "$C" "$B/api/requests" | py "print(json.dumps([r for r in d['requests'] if r['id']=='$CRID'][0]))")
check "  carrying both garments" "$(echo "$CRROW" | py "print(d['lineCount'])")" '^2$'
check "  three between them" "$(echo "$CRROW" | py "print(d['garments'])")" '^3$'
check "  and the timeline says where it came from" "$(echo "$CRROW" | py "print(d['events'][0]['meta'])")" 'Raised at the counter'
check "an unknown garment is refused here too" "$(mut request.raise "{\"staffId\":\"$WID\",\"lines\":[{\"itemId\":\"nope\",\"si\":0,\"qty\":1}]}")" "isn't available"
check "so is a request with nothing on it" "$(mut request.raise "{\"staffId\":\"$WID\",\"lines\":[]}")" 'at least one garment'
check "and one for somebody with no manager" "$(mut request.raise "{\"staffId\":\"$OID\",\"lines\":[{\"itemId\":\"$IID\",\"si\":1,\"qty\":1}]}")" 'no manager recorded'
check "the manager decides it like any other" "$(smut request.approve "$M" "{\"id\":\"$CRID\"}")" '"status":"accepted"'
check "  and the wearer is told who raised it" "$(curl -s -b "$W" "$B/my/orders/$CRID")" 'Raised for you by Sal Linen'

echo "== a bag for somebody with no ward stays at the counter"
# The round delivers to a ward, so a wearer whose ward was never filled in has nowhere for one to
# go. The check that a ward has somebody who can sign counted staff on `dept`, which matched every
# ward-less clerk in the building against every ward-less wearer — Nia against Pat — and let the
# bag out onto a round that would then be signed for by a stranger.
NR=$(mut request.raise "{\"staffId\":\"$PID\",\"lines\":[{\"itemId\":\"$IID\",\"si\":1,\"qty\":1}]}")
check "the counter raises one for the ward-less nurse" "$NR" '"code"'
NRID=$(echo "$NR" | py "print(d['result']['id'])")
check "  her manager approves it" "$(smut request.approve "$M" "{\"id\":\"$NRID\"}")" '"status":"accepted"'
check "  and the linen room picks it" "$(mut request.pick "{\"id\":\"$NRID\"}")" '"status":"picking"'
check "but it cannot be sent on the round" "$(mut request.round "{\"id\":\"$NRID\"}")" 'no ward recorded'
check "  and the counter is what is left" "$(mut request.hold "{\"id\":\"$NRID\"}")" '"status":"ready"'

echo "== messages hang off one order"
check "the wearer asks" "$(smut request.message "$W" "{\"id\":\"$RID\",\"body\":\"Any chance of a 14?\"}")" '"id"'
check "the linen room replies" "$(mut request.reply "{\"id\":\"$RID\",\"body\":\"We have one put by.\"}")" '"id"'
THREAD=$(curl -s -b "$W" "$B/my/orders/$RID/messages")
check "both appear in the thread" "$THREAD" 'Any chance of a 14'
check "  including the reply" "$THREAD" 'We have one put by'
check "a stranger cannot post to it" "$(smut request.message "$O" "{\"id\":\"$RID\",\"body\":\"hello\"}")" 'No such request'
refused "nor read it" "$O" "/my/orders/$RID/messages" "Send"

echo "== the record query with no order behind it"
check "the wearer raises one" "$(smut dispute.raise "$W" '{"body":"I handed two tunics back in August"}')" '"id"'
QUERIES=$(curl -s -b "$C" "$B/api/requests")
check "the linen room sees it" "$QUERIES" 'handed two tunics back'
DQ=$(echo "$QUERIES" | py "print(d['disputes'][0]['id'])")
check "and can mark it sorted" "$(mut dispute.resolve "{\"id\":\"$DQ\"}")" '"ok":true'
no "after which it is off the queue" "$(curl -s -b "$C" "$B/api/requests")" 'handed two tunics back'

echo "== the waitlist"
check "joining a size that is on the shelf is allowed" "$(smut waitlist.join "$W" "{\"itemId\":\"$IID\",\"si\":0}")" '"id"'
check "but only once" "$(smut waitlist.join "$W" "{\"itemId\":\"$IID\",\"si\":0}")" 'already on the list'
WL=$(curl -s -b "$W" "$B/my/waitlist?item=$IID&si=0")
check "the screen shows a position" "$WL" 'in queue'
check "  and says waiting needs no approval" "$WL" "doesn’t need approval"
WLID=$(curl -s -b "$C" "$B/api/requests" | py "print(d['waiting'][0]['id'])")
check "the linen room offers it when stock lands" "$(mut waitlist.offer "{\"id\":\"$WLID\"}")" '"ok":true'
ACC=$(smut waitlist.accept "$W" "{\"id\":\"$WLID\"}")
check "accepting raises a request" "$ACC" '"request"'
ARID=$(echo "$ACC" | py "print(d['result']['request']['id'])")
check "  which still needs the manager" "$(curl -s -b "$C" "$B/api/requests" | py "print([r for r in d['requests'] if r['id']=='$ARID'][0]['status'])")" '^awaiting$'
check "leaving a list you are not on is refused" "$(smut waitlist.leave "$W" '{"id":"nope"}')" 'Not on that list'

echo "== the kit check"
check "answering with no cycle open is refused" "$(smut kit.answer "$W" "{\"itemId\":\"$IID\",\"si\":1,\"onRecord\":2,\"confirmed\":2}")" 'No kit check is open'
# Between rounds the screen exists and says so: a kit check that is closed is not a secret, and a
# 404 there taught somebody with a notification in their hand that the app was broken. A refusal is
# still the answer everywhere the ROLE is not theirs — see the four checks near the end of the file.
KCCLOSED=$(curl -s -b "$W" "$B/my/kitcheck")
check "between rounds the screen says there is nothing to answer" "$KCCLOSED" 'No kit check is open'
no "  rather than asking them to count anything" "$KCCLOSED" 'Still have'
check "the linen room opens a round" "$(mut kitcheck.open '{"dueBy":"2026-12-01"}')" '"id"'
check "and cannot open a second" "$(mut kitcheck.open '{"dueBy":"2026-12-01"}')" 'already running'
# Give them something to count. The fleece is what the answers below are checked against: the tunic
# has been handed to Jamila more than once already in this file — at the counter, and again here —
# so the figure on her record for it is nothing this script chose. The fleece has never been near
# her, so three is three.
# One tunic, not three: counting the request lines a manager has already approved for her, she holds
# four tops, and three more would take her past the six anyone may hold. The tunic only has to be on
# her record for the screen to list it.
check "the wearer is issued garments" "$(mut issue.create "{\"staffId\":\"$WID\",\"lines\":[{\"itemId\":\"$IID\",\"si\":1,\"qty\":1}]}")" '"ok":true'
check "  and a garment nobody has handed them before" "$(mut issue.create "{\"staffId\":\"$WID\",\"lines\":[{\"itemId\":\"$FID\",\"si\":0,\"qty\":3}]}")" '"ok":true'
KC=$(curl -s -b "$W" "$B/my/kitcheck")
# The heading moves with the copy, so the checks sit on the things that cannot: the screen names
# the garments the record claims and promises nothing is chargeable. The last one is the rule this
# product keeps getting wrong — a wearer takes their uniform home and launders it themselves, so a
# screen that asks them to go and look in a locker is asking about a locker they do not have, and
# gets answered from imagination or not at all.
check "the screen appears" "$KC" 'Kit check'
check "  listing what the record says they hold" "$KC" 'Navy tunic'
check "  counted off against the record" "$KC" 'on your record'
check "  and says nothing is chargeable" "$KC" 'chargeable'
no "  and never sends them to a locker" "$KC" '[Ll]ocker'
# The onRecord in the payload came off the phone and is worth nothing as evidence, so the 99 here
# is a deliberate lie: a shortfall of 2 is only possible if the server threw it away and re-read
# the record. Taking the client's word for it would report a shortfall of 98.
SHORT=$(smut kit.answer "$W" "{\"itemId\":\"$FID\",\"si\":0,\"onRecord\":99,\"confirmed\":1}")
check "a shortfall is recorded" "$SHORT" '"short":2'
check "  against the record's figure, not the phone's" "$(curl -s -b "$C" "$B/api/requests" | py "print([s for s in d['shortfalls'] if s['staffId']=='$WID' and s['item']=='Fleece jacket'][0]['onRecord'])")" '^3$'
# Confirming more than the record says is clamped, not carried through as a negative shortfall:
# without the clamp this answer reports -6 and the linen room reconciles against it.
check "confirming more than the record is clamped" "$(smut kit.answer "$W" "{\"itemId\":\"$FID\",\"si\":0,\"onRecord\":3,\"confirmed\":9}")" '"short":0'
CYC=$(curl -s -b "$C" "$B/api/requests" | py "print(d['cycle']['id'])")
check "the linen room closes the round" "$(mut kitcheck.close "{\"id\":\"$CYC\"}")" '"ok":true'

echo "== a wearer still cannot reach the register"
check "no coordinator mutation" "$(curl -s -b "$W" -X POST "$B/api/mutate" -H 'content-type: application/json' -H "origin: $B" -d '{"op":"request.pick","payload":{"id":"x"}}')" 'Not signed in'
check "no backup" "$(curl -s -b "$W" "$B/api/backup")" 'Not signed in'
check "no linen-room request list" "$(curl -s -b "$W" "$B/api/requests")" 'Not signed in'
refused "no approvals queue without reports" "$W" "/my/approvals" "Approve"
# The leak half of a refused() check is only worth anything if the screen really does render the
# string. `On the ward` appears nowhere in Ward.tsx, so that half could never fail: the fence could
# have broken and served a colleague's roster and this check would still have passed. `Items held`
# is the band Ward.tsx draws, proved by the manager's own check further down. `Sign for` was the
# same mistake more quietly — Round.tsx only writes it when more than one bag is waiting — so the
# round checks grep the kicker every round screen carries, proved at the desk's own screen above.
refused "no ward view without reports" "$W" "/my/ward" "Items held"
refused "no ward round without the flag" "$W" "/my/round" "Ward round"
# The flag is not enough on its own: the round is one ward's bags, and a clerk whose ward was never
# recorded has none. Left as a plain match on `dept`, which defaults to an empty string, Nia's
# round would have been every ward-less person's bags in the facility.
refused "nor with the flag but no ward" "$N" "/my/round" "Ward round"
# And the bar must not offer her the way in: a tab drawn from the desk flag in front of a route
# fenced on the ward is a tab that 404s on every screen in the app.
NHOME=$(curl -s -b "$N" "$B/my")
no "  and the bar offers her no ward tab at all" "$NHOME" '/my/team'
check "  home says why instead" "$NHOME" 'No ward on your record'
check "the clerk who does have a ward keeps the tab" "$(curl -s -b "$D" "$B/my")" '/my/team'
refused "  and the ward-less clerk's team page is a refusal" "$N" "/my/team" "Round"
check "the manager does get an approvals queue" "$(curl -s -b "$M" "$B/my/approvals")" 'Approvals'
check "and a ward view" "$(curl -s -b "$M" "$B/my/ward")" 'Items held'

echo "== the website's Log in box opens the staff app too"
# A wearer reaches the product the way anybody else does — the home page, then Log in — and types
# the details they set up in the app. So the one box asks the coordinator table first and the
# register only when that address has no coordinator account.
#
# It matters that this is a lookup and not a second attempt. "Try the coordinator, and if that fails
# try the staff one" would score a failure against every staff sign-in, and those ceilings count
# failures: behind one hospital's NAT address at shift change that is a locked-out ward.
#
# Both markers are read off the record: the name says whose session it is, and the static label says
# the screen actually rendered. Either alone would pass on a page that came back for the wrong
# reason.
P="$T/tc-sa-web.txt"; rm -f "$P"
check "the wearer signs in at the website's Log in box" "$(curl -s -c "$P" -X POST "$B/api/auth/login" -H 'content-type: application/json' -H "origin: $B" -d "{\"email\":\"w$TS@example.com\",\"password\":\"wearerpass1\"}")" '"staff":true'
WEB=$(curl -s -b "$P" "$B/my")
check "  and the cookie it set opens her own record" "$WEB" 'Jamila'
check "  which is the staff app, not a web page" "$WEB" 'Request an item'
check "  a wrong password there is refused" "$(curl -s -X POST "$B/api/auth/login" -H 'content-type: application/json' -H "origin: $B" -d "{\"email\":\"w$TS@example.com\",\"password\":\"nope\"}")" 'Email or password doesn'
# The app's own door, which the printed slip and the Play app use. The two share one implementation
# now, and nothing else in this file signs in through it — a refactor that broke it would otherwise
# ship green.
Q="$T/tc-sa-door.txt"; rm -f "$Q"
check "the staff app's own door still signs her in" "$(curl -s -c "$Q" -X POST "$B/api/staff/login" -H 'content-type: application/json' -H "origin: $B" -d "{\"email\":\"w$TS@example.com\",\"password\":\"wearerpass1\"}")" '"ok":true'
check "  and that cookie opens the same record" "$(curl -s -b "$Q" "$B/my")" 'Jamila'
check "  a wrong password at that door is refused too" "$(curl -s -X POST "$B/api/staff/login" -H 'content-type: application/json' -H "origin: $B" -d "{\"email\":\"w$TS@example.com\",\"password\":\"nope\"}")" 'Email or password doesn'
# A coordinator is still a coordinator at the same box, and is sent to the counter rather than the
# staff app.
R="$T/tc-sa-coordweb.txt"; rm -f "$R"
CW=$(curl -s -c "$R" -X POST "$B/api/auth/login" -H 'content-type: application/json' -H "origin: $B" -d "{\"email\":\"$CO\",\"password\":\"password123\"}")
check "the linen room signs in at the same box" "$CW" '"ok":true'
no "  and is not sent to the staff app" "$CW" '"staff":true'
# One address, one destination. Where both exist the coordinator account wins — which also means the
# staff password on that address opens nothing, and that person reaches their record from inside the
# app. That is the cost of the rule, so it is written down here rather than discovered later.
BID=$(mut staff.save '{"num":"B1","first":"Bo","last":"Both","group":"Registered Nurse","dept":"Rosewood Ward"}' | py "print(d['result']['id'])")
check "somebody claims a staff account on the linen room's own address" "$(claim "$BID" "$T/tc-sa-both.txt" "$CO")" '"ok":true'
BW=$(curl -s -X POST "$B/api/auth/login" -H 'content-type: application/json' -H "origin: $B" -d "{\"email\":\"$CO\",\"password\":\"password123\"}")
check "  the coordinator password still opens the counter" "$BW" '"ok":true'
no "  and does not open the staff app" "$BW" '"staff":true'
check "  while the staff password on that address opens nothing" "$(curl -s -X POST "$B/api/auth/login" -H 'content-type: application/json' -H "origin: $B" -d "{\"email\":\"$CO\",\"password\":\"wearerpass1\"}")" 'Email or password doesn'

echo "== messages have a screen of their own"
# The Messages tab used to be a button that pushed /my/orders: a control among links, missing from
# anything that lists a page's navigation, and a tab that lied about where it went. It is a link
# now, and this is the screen behind it.
MSGS=$(curl -s -b "$W" "$B/my/messages")
check "the wearer has a messages screen" "$MSGS" 'Messages'
check "  naming who is on the other end" "$MSGS" 'Linen room'
check "  and showing the last thing said" "$MSGS" 'We have one put by'
check "the tab bar links to it" "$(curl -s -b "$W" "$B/my")" 'href="/my/messages"'
# Unread is only ever about what the linen room said, and it has to be able to go out again: before
# this build nothing ever wrote readAt, so the first reply marked a thread new for ever.
check "opening the thread marks the reply read" "$(smut request.read "$W" "{\"id\":\"$RID\"}")" '"read":1'
check "  and a second look has nothing left to mark" "$(smut request.read "$W" "{\"id\":\"$RID\"}")" '"read":0'
check "somebody else's thread cannot be marked read" "$(smut request.read "$O" "{\"id\":\"$RID\"}")" 'No such request'

echo "== the team tab leads where each reader can actually go"
MTEAM=$(curl -s -b "$M" "$B/my/team"); DTEAM=$(curl -s -b "$D" "$B/my/team")
check "a manager's team tab opens the approvals queue" "$MTEAM" '/my/approvals'
no "  and not the ward round they are not on" "$MTEAM" '/my/round'
check "the ward desk's opens the round" "$DTEAM" '/my/round'
no "  and not a queue they have none of" "$DTEAM" '/my/approvals'
refused "and somebody who is neither has no team at all" "$W" "/my/team" "Approvals"
# An approver who manages nobody. The linen room can re-address a request to somebody with no
# reports, and gating the tab, the badge and the banner on "is a manager" would take away the only
# door they have — with a colleague waiting behind it.
RA=$(smut request.create "$Y" "{\"lines\":[{\"itemId\":\"$IID\",\"si\":1,\"qty\":1}],\"reason\":\"Worn out\"}" | py "print(d['result']['id'])")
check "a request is re-addressed to somebody who manages nobody" "$(mut request.reassign "{\"id\":\"$RA\",\"managerId\":\"$OID\"}")" '"ok":true'
OAPP=$(curl -s -b "$O" "$B/my/approvals")
check "  who can open the queue" "$OAPP" 'Approvals'
check "  and sees the ask waiting on it" "$OAPP" 'Rafa Lines'
check "  with the banner on home" "$(curl -s -b "$O" "$B/my")" 'waiting on you'
check "  and a team tab that opens the queue" "$(curl -s -b "$O" "$B/my/team")" '/my/approvals'
check "  and the tab bar carries the count" "$(curl -s -b "$O" "$B/my")" 'Team, 1 need you'
# Approving from the queue refreshes the page the approver is standing on, so the fence on that page
# decides what the last approval of all lands on. Asking only "does anybody report to you" turned
# the tap that emptied his queue into "That page isn't here." — for the one person this queue exists
# to protect, who manages nobody and was handed somebody else's request to decide.
check "  he approves the last request in it" "$(smut request.approve "$O" "{\"id\":\"$RA\"}")" '"status":"accepted"'
OEMPTY=$(curl -s -b "$O" "$B/my/approvals")
check "  and the queue he is standing on is still a screen" "$OEMPTY" 'Nothing waiting on you'
no "  with no empty tab row left above it" "$OEMPTY" 'aria-label="Team"'
# A manager whose queue is empty gets a state, not a dead end: the queue is theirs, it is just empty.
EMPID=$(mut staff.save '{"num":"E1","first":"Esi","last":"Empty","group":"Registered Nurse","dept":"Rosewood Ward"}' | py "print(d['result']['id'])")
EMPRID=$(mut staff.save '{"num":"E2","first":"Femi","last":"Reports","group":"Registered Nurse","dept":"Rosewood Ward"}' | py "print(d['result']['id'])")
check "somebody is given a report" "$(mut staff.patch "{\"id\":\"$EMPRID\",\"managerId\":\"$EMPID\"}")" '"ok":true'
E="$T/tc-sa-empty.txt"; rm -f "$E"
check "  and claims an account" "$(claim "$EMPID" "$E" "e$TS@example.com")" '"ok":true'
EMPTYQ=$(curl -s -b "$E" "$B/my/approvals")
check "an empty queue is a state" "$EMPTYQ" 'Nothing waiting on you'
check "  saying where those requests will arrive" "$EMPTYQ" 'arrive by notification and email'

echo "== the collection code, full screen"
CC=$(smut request.create "$Z" "{\"lines\":[{\"itemId\":\"$IID\",\"si\":1,\"qty\":1}],\"reason\":\"Worn out\"}" | py "print(d['result']['id'])")
refused "no code while it is still with the manager" "$Z" "/my/orders/$CC/code" "Show at the counter"
check "the manager approves it" "$(smut request.approve "$M" "{\"id\":\"$CC\"}")" '"status":"accepted"'
check "the linen room picks it" "$(mut request.pick "{\"id\":\"$CC\"}")" '"status":"picking"'
check "  and holds it at the counter" "$(mut request.hold "{\"id\":\"$CC\",\"holdUntil\":\"Fri 4pm\"}")" '"status":"ready"'
CCODE=$(curl -s -b "$C" "$B/api/requests" | py "print([r for r in d['requests'] if r['id']=='$CC'][0]['collectCode'])")
CODEPAGE=$(curl -s -b "$Z" "$B/my/orders/$CC/code")
check "the code screen carries the digits" "$CODEPAGE" "$CCODE"
check "  and whose bag it is" "$CODEPAGE" 'Ines Trolley'
no "  with no tab bar to wander off into" "$CODEPAGE" 'aria-label="Main"'
# The manager may read the order — the code is not theirs to hold up at a counter.
refused "the manager who approved it cannot open the code" "$M" "/my/orders/$CC/code" "Show at the counter"
refused "nor can a stranger" "$O" "/my/orders/$CC/code" "Show at the counter"
# ⛔ And not on the order screen either. Four people can open an order — the wearer, the manager it
# was addressed to, whoever raised it, and the desk holding the bag — and only one of them collects
# it. The code printed there let the approver read the four digits off her own approvals history and
# walk to the counter with them, under a button that then refused her.
MORDER=$(curl -s -b "$M" "$B/my/orders/$CC")
check "the manager can still read the order" "$MORDER" 'Ines Trolley'
no "  but the code is not on it" "$MORDER" 'Collection code'
no "  nor a button to hold up at the counter" "$MORDER" 'Show at the counter'
ZORDER=$(curl -s -b "$Z" "$B/my/orders/$CC")
check "the wearer's own order carries the code" "$ZORDER" 'Collection code'
check "  and the way to show it" "$ZORDER" 'Show at the counter'
check "the bag goes home" "$(mut request.collected "{\"id\":\"$CC\"}")" '"status":"collected"'
refused "and the code screen closes behind it" "$Z" "/my/orders/$CC/code" "Show at the counter"

echo "== notifications: the switches, and this phone"
# The preferences are the server's and they are per person. There is no staffId in the payload, so
# there is no way to reach somebody else's switches through it.
check "a wearer turns one off" "$(smut notify.prefs "$W" '{"ready":false}')" '"ready":false'
check "  the others stay on" "$(smut notify.prefs "$W" '{}')" '"approved":true'
check "  and it is still off when asked again" "$(smut notify.prefs "$W" '{}')" '"ready":false'
check "a colleague writing a staffId writes only their own" "$(smut notify.prefs "$O" "{\"staffId\":\"$WID\",\"ready\":true}")" '"ready":true'
check "  and the wearer's switch did not move" "$(smut notify.prefs "$W" '{}')" '"ready":false'
# A device token is stored, never handed back. With no TC_FCM_KEY_FILE on this server every send is
# a no-op, which is the correct answer and not a failure — registering still has to work, or nobody
# could turn notifications on before the key was installed.
TOK="e2e-device-token-$TS"
REG=$(smut push.register "$W" "{\"token\":\"$TOK\"}")
check "a phone registers with no sender configured" "$REG" '"ok":true'
check "  and is told the server cannot send yet" "$REG" '"configured":false'
no "  without the token coming back" "$REG" "$TOK"
no "  and the account screen never carries it" "$(curl -s -b "$W" "$B/my/account")" "$TOK"
no "  nor does home" "$(curl -s -b "$W" "$B/my")" "$TOK"
check "signing out hands the phone back" "$(smut push.forget "$W" "{\"token\":\"$TOK\"}")" '"ok":true'
check "a token nobody registered cannot be forgotten by somebody else" "$(smut push.forget "$O" "{\"token\":\"$TOK\"}")" '"ok":true'
check "an empty token is refused" "$(smut push.register "$W" '{"token":""}')" 'No device token'

echo "== the messages screen, thread by thread"
# The tab and the screen behind it are checked above; this is what a row has to carry. A thread is
# always about one request — there is no inbox in this product — so the row names the order, says
# how far it has got, and goes to the thread rather than to the order.
RIDCODE=$(curl -s -b "$C" "$B/api/requests" | py "print([r for r in d['requests'] if r['id']=='$RID'][0]['code'])")
MSGS2=$(curl -s -b "$W" "$B/my/messages")
check "the thread row names the order it hangs off" "$MSGS2" "$RIDCODE"
check "  and how far that order has got" "$MSGS2" 'Collected'
check "  and opens the thread, not the order" "$MSGS2" "/my/orders/$RID/messages"
# An open order nobody has said anything about is offered rather than hidden: that is where the next
# thread comes from, and a screen that listed only existing threads is a dead end for somebody who
# has never sent a message.
check "  with an order that could start one under it" "$MSGS2" 'Start one'
# Nothing to show is a state, not a refusal (the per-case table): there is nothing private about
# having said nothing yet. Esi has a queue of her own and has never asked for anything.
EMSGS=$(curl -s -b "$E" "$B/my/messages")
check "somebody who has never asked gets a state" "$EMSGS" 'No messages yet'
check "  saying where a thread would start" "$EMSGS" 'Ask about any order and the thread starts here'
no "  and not a word of anybody else's" "$EMSGS" 'We have one put by'

echo "== a signed slip reaches the wearer, with the quantity on it"
# ⛔ The one number a wearer is shown that is not their own record. A slip is not the linen room's
# count of anything — it is the hand-over they stood at the counter and put their name to — and
# three trousers under one date have to read as three rather than as the same line three times.
PNG='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='
SIG=$(mut photo.put "{\"kind\":\"sig\",\"data\":\"$PNG\"}" | py "print(d['result']['id'])")
check "the counter takes a signature" "$SIG" '.'
SLIP=$(mut issue.create "{\"staffId\":\"$VID\",\"apDeduct\":0,\"sigId\":\"$SIG\",\"slip\":true,\"lines\":[{\"itemId\":\"$IID\",\"si\":1,\"qty\":3,\"src\":\"stock\"}]}")
check "  and files a slip against the hand-over" "$SLIP" '"slipId"'
SLIPID=$(echo "$SLIP" | py "print(d['result']['slipId'])")
KITV=$(curl -s -b "$V" "$B/my/kit")
check "the slip is on the wearer's own kit screen" "$KITV" "$SLIPID"
check "  naming the garment" "$KITV" 'Navy tunic'
check "  and the size it was signed for" "$KITV" '"size\\":\\"12'
# Grouped and counted, not repeated: one line carrying three.
check "  carrying the quantity" "$KITV" 'qty\\":3'
no "  rather than the same line three times" "$KITV" 'qty\\":1,'
# ⛔ What the ward paid for them is not the wearer's business, on the slip or anywhere near it.
no "  with no money anywhere near it" "$KITV" 'cost\\":3'
no "and it is on nobody else's kit screen" "$(curl -s -b "$Y" "$B/my/kit")" "$SLIPID"

echo "== what a notification would say, and whose phone it would reach"
# A notification leaves the server for Google and never comes back, so this is the one thing curl
# cannot see: the words in the body, and whose phone they were addressed to. scripts/push-probe.ts
# runs the real sender with the transport replaced by a recorder — no key of anybody's, nothing
# sent anywhere, and the token itself never printed.
PN=$(smut request.create "$W" "{\"lines\":[{\"itemId\":\"$IID\",\"si\":1,\"qty\":1}],\"reason\":\"Worn out\"}" | py "print(d['result']['id'])")
check "a request to be told about" "$PN" '.'
check "  approved" "$(smut request.approve "$M" "{\"id\":\"$PN\"}")" '"status":"accepted"'
check "  picked" "$(mut request.pick "{\"id\":\"$PN\"}")" '"status":"picking"'
check "  and held at the counter" "$(mut request.hold "{\"id\":\"$PN\",\"holdUntil\":\"Fri 6pm\"}")" '"status":"ready"'
PNROW=$(curl -s -b "$C" "$B/api/requests" | py "print(json.dumps([r for r in d['requests'] if r['id']=='$PN'][0]))")
PNCODE=$(echo "$PNROW" | py "print(d['code'])")
PNCOLLECT=$(echo "$PNROW" | py "print(d['collectCode'])")
PTOK="e2e-push-token-$TS"
check "the wearer's phone registers" "$(smut push.register "$W" "{\"token\":\"$PTOK\"}")" '"ok":true'
# Her "Ready to collect" switch was turned off further up, and it is the SENDER that honours it —
# a trigger should say what happened, not work out who wants to hear about it.
check "  and her switch is still off" "$(smut notify.prefs "$W" '{}')" '"ready":false'
check "a switch turned off silences the send" "$(npx tsx scripts/push-probe.ts send ready "$PN")" '"count":0'
check "  so the audience for it is nobody" "$(npx tsx scripts/push-probe.ts audience "$WID" ready)" '"count":0'
check "turning it back on" "$(smut notify.prefs "$W" '{"ready":true}')" '"ready":true'
SENT=$(npx tsx scripts/push-probe.ts send ready "$PN")
check "  reaches the one phone" "$SENT" '"count":1'
check "  addressed to its owner" "$SENT" "$WID"
check "  saying what happened" "$SENT" 'Ready to collect'
check "  under the request's own code" "$SENT" "$PNCODE"
check "  naming the garment" "$SENT" 'Navy tunic'
check "  and opening that order when tapped" "$SENT" "/my/orders/$PN"
# ⛔ The three rules the body obeys, and the reason for the first: a body is drawn on a ward phone's
# lock screen, and the collection code is what a bag is handed over against. This is the documented
# difference from the approved mockup, which put the code on the card.
no "the body never carries the collection code" "$SENT" "$PNCOLLECT"
no "  nor a count of anything" "$SENT" '[0-9] garment'
no "  nor money" "$SENT" 'cost\|[$]'
# A token belongs to exactly one staff account. A phone handed on re-points to whoever registered it
# last — so the person who left stops being told about the person who arrived — and the account that
# no longer holds it cannot reach it.
check "another account registers the same phone" "$(smut push.register "$O" "{\"token\":\"$PTOK\"}")" '"ok":true'
check "  after which the old account has no phone at all" "$(npx tsx scripts/push-probe.ts audience "$WID" ready)" '"count":0'
check "  and the send that just reached her reaches nobody" "$(npx tsx scripts/push-probe.ts send ready "$PN")" '"count":0'
check "  while the account that registered it has it" "$(npx tsx scripts/push-probe.ts audience "$OID" ready)" '"count":1'
check "the old account forgetting that token is refused" "$(smut push.forget "$W" "{\"token\":\"$PTOK\"}")" '"ok":true'
check "  the phone still belongs to the one that registered it" "$(npx tsx scripts/push-probe.ts audience "$OID" ready)" '"count":1'
check "and its own account can hand it back" "$(smut push.forget "$O" "{\"token\":\"$PTOK\"}")" '"ok":true'
check "  after which nothing is written to" "$(npx tsx scripts/push-probe.ts audience "$OID" ready)" '"count":0'
# The one send addressed to an approver rather than to a wearer: it names who is waiting, and opens
# the decision rather than the order.
WTOK="e2e-push-mgr-$TS"
check "the approver's phone registers" "$(smut push.register "$M" "{\"token\":\"$WTOK\"}")" '"ok":true'
WREQ=$(smut request.create "$Y" "{\"lines\":[{\"itemId\":\"$TID\",\"si\":0,\"qty\":1}],\"reason\":\"Worn out\"}" | py "print(d['result']['id'])")
WSENT=$(npx tsx scripts/push-probe.ts send waiting "$WREQ")
check "a new request tells whoever it is addressed to" "$WSENT" '"count":1'
check "  naming the person waiting on them" "$WSENT" 'Rafa Lines'
check "  and opening the decision" "$WSENT" "/my/approvals/$WREQ"
no "  with no code in it at all" "$WSENT" 'R-[0-9]'
check "the approver hands the phone back" "$(smut push.forget "$M" "{\"token\":\"$WTOK\"}")" '"ok":true'

echo "== approving from the queue settles the whole ask"
# The commonest decision by far is "yes, all of it", and it is made in the list now rather than
# behind another screen. The chip sends every line explicitly — approving from the queue is
# approving all of them, said out loud rather than by omission.
QR=$(smut request.create "$Y" "{\"lines\":[{\"itemId\":\"$IID\",\"si\":1,\"qty\":1},{\"itemId\":\"$TID\",\"si\":0,\"qty\":1}],\"reason\":\"Worn out\"}")
QID=$(echo "$QR" | py "print(d['result']['id'])")
QROW=$(curl -s -b "$C" "$B/api/requests" | py "print(json.dumps([r for r in d['requests'] if r['id']=='$QID'][0]))")
QL1=$(echo "$QROW" | py "print(d['lines'][0]['id'])")
QL2=$(echo "$QROW" | py "print(d['lines'][1]['id'])")
MQ=$(curl -s -b "$M" "$B/my/approvals")
check "the queue carries the ask" "$MQ" 'Rafa Lines'
check "  with a one-tap approval on the row" "$MQ" 'Approve [0-9]'
check "  and a way into the garment-by-garment screen" "$MQ" "/my/approvals/$QID"
QAP=$(smut request.approve "$M" "{\"id\":\"$QID\",\"lines\":[{\"id\":\"$QL1\",\"decision\":\"approved\",\"reason\":\"\"},{\"id\":\"$QL2\",\"decision\":\"approved\",\"reason\":\"\"}]}")
check "approving from the queue accepts the request" "$QAP" '"status":"accepted"'
QROW2=$(curl -s -b "$C" "$B/api/requests" | py "print(json.dumps([r for r in d['requests'] if r['id']=='$QID'][0]))")
check "  with every garment approved" "$(echo "$QROW2" | py "print(len([l for l in d['lines'] if l['status']=='approved']))")" '^2$'
check "  and the whole ask in the bag" "$(echo "$QROW2" | py "print(len(d['bag']))")" '^2$'
no "and the row has left the queue" "$(curl -s -b "$M" "$B/my/approvals")" "/my/approvals/$QID"

echo "== signing for every bag, and stopping where it cannot"
# Sign for all is one call per bag, because a signature is against one hand-over. What matters is
# the half-way refusal: it stops, says how many were signed and which bag it stopped on, and leaves
# the rest exactly as they were rather than carrying on past them.
SA=$(smut request.create "$Z" "{\"lines\":[{\"itemId\":\"$IID\",\"si\":1,\"qty\":1}],\"reason\":\"Worn out\"}" | py "print(d['result']['id'])")
SB=$(smut request.create "$Z" "{\"lines\":[{\"itemId\":\"$IID\",\"si\":1,\"qty\":1}],\"reason\":\"Worn out\"}" | py "print(d['result']['id'])")
SC=$(smut request.create "$Z" "{\"lines\":[{\"itemId\":\"$IID\",\"si\":1,\"qty\":1}],\"reason\":\"Worn out\"}" | py "print(d['result']['id'])")
check "three bags for one ward" "$(printf '%s\n' "$SA" "$SB" "$SC" | grep -c .)" '^3$'
for r in "$SA" "$SB" "$SC"; do
  smut request.approve "$M" "{\"id\":\"$r\"}" > /dev/null
  mut request.pick "{\"id\":\"$r\"}" > /dev/null
  mut request.round "{\"id\":\"$r\"}" > /dev/null
done
check "all three go out on the round" "$(curl -s -b "$C" "$B/api/requests" | py "print(len([r for r in d['requests'] if r['id'] in ('$SA','$SB','$SC') and r['status']=='round']))")" '^3$'
# Another clerk signs the middle one a moment before the bulk press — which is the whole reason the
# run cannot assume its own list is still true.
check "somebody else signs one of them first" "$(smut round.sign "$D" "{\"id\":\"$SB\"}")" '"ok":true'
check "the run signs the first" "$(smut round.sign "$D" "{\"id\":\"$SA\"}")" '"ok":true'
check "  and stops on the one already gone" "$(smut round.sign "$D" "{\"id\":\"$SB\"}")" 'No such bag'
check "  leaving the bag after it untouched" "$(curl -s -b "$C" "$B/api/requests" | py "print([r for r in d['requests'] if r['id']=='$SC'][0]['status'])")" '^round$'
check "  and what was signed, signed" "$(curl -s -b "$C" "$B/api/requests" | py "print([r for r in d['requests'] if r['id']=='$SA'][0]['status'])")" '^delivered$'
check "the clerk signs the rest by hand" "$(smut round.sign "$D" "{\"id\":\"$SC\"}")" '"ok":true'
check "  after which the round has nothing left to sign" "$(curl -s -b "$D" "$B/my/round")" 'Every bag is signed'

echo "== nothing to show, told apart from not yours"
# Two different answers, deliberately. A record that is not yours is a dead end with no explanation
# — a refusal that explains itself confirms the thing exists — and those are checked all through
# this file. These are the other case: the screen is yours, and there is nothing on it today.
QUIET=$(mut staff.save '{"num":"Q9","first":"Dara","last":"Quiet","group":"Admin","dept":"Quiet Ward"}' | py "print(d['result']['id'])")
check "a clerk on a ward with nothing arriving" "$QUIET" '.'
check "  is put on the desk" "$(mut staff.patch "{\"id\":\"$QUIET\",\"wardDesk\":true}")" '"ok":true'
G="$T/tc-sa-quiet.txt"; rm -f "$G"
check "  and claims an account" "$(claim "$QUIET" "$G" "q$TS@example.com")" '"ok":true'
QROUND=$(curl -s -b "$G" "$B/my/round")
check "their round is a state, not a dead end" "$QROUND" 'Nothing on the round for Quiet Ward right now'
no "  and carries no other ward's bags" "$QROUND" 'Ines Trolley'
# A kit check that is open, with nothing on this person's record to answer about.
check "the linen room opens another round" "$(mut kitcheck.open '{"dueBy":"2026-12-02"}')" '"id"'
QKIT=$(curl -s -b "$G" "$B/my/kitcheck")
check "somebody holding nothing is told so" "$QKIT" 'Nothing on your record to check'
no "  rather than asked to count nothing" "$QKIT" 'Still have'
CYC2=$(curl -s -b "$C" "$B/api/requests" | py "print(d['cycle']['id'])")
check "the linen room closes it again" "$(mut kitcheck.close "{\"id\":\"$CYC2\"}")" '"ok":true'
# A waiting list for a garment nobody stocks is not a state: there is nothing to be on, and the
# screen that would show a queue position must not be drawn at all.
refused "a waitlist for a garment nobody has is refused" "$W" "/my/waitlist?item=nope&si=0" 'in queue'
refused "  and so is a size that does not exist" "$W" "/my/waitlist?item=$IID&si=99" 'in queue'

echo "== unknown ops are refused, not ignored"
check "made-up staff op" "$(smut nonsense.thing "$W" '{}')" 'Unknown action'

echo; echo "PASS=$PASS FAIL=$FAIL"; [ "$FAIL" -eq 0 ]
