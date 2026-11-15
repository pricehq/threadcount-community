#!/usr/bin/env bash
# The uniform ceiling: six sets HELD at any time, for every staff group, nursing included. There is no
# financial year in it — room comes back only by handing something in, and past six takes a coordinator
# override that is recorded as one. Every refusal below is earned by the ceiling and by nothing else,
# and each sits beside the collection one garment short of it, so a check that matched everything would
# fail its neighbour.
#
# The routes up to that ceiling are the facility's own answer. It names its staff groups and puts each
# one on the FTE table, the starting kit or manager approval, and nothing reads the route off the
# letters in a group's name — the same job is "Housekeeping" in one building and "Support Services" in
# the next. The last three sections move one group between routes and read what its wearer is offered
# after each move, so a screen that ignored the setting would give the same answer twice and fail one
# of the pair.
#
# The closing sections are the staff groups a garment is tagged with. A garment can be for several
# groups, and anybody is offered their own group's garments plus those for every group: the staff app
# refuses the rest outright, and the counter hands them over only on the coordinator's override,
# recorded apart from an override of the ceiling. Every refusal there sits beside the same ask from
# somebody whose group the garment is for. The counter's own request door and every order raised for
# a person refuse the same garments, with no override of their own; what the counter did issue on the
# override stays marked through a collection, a ward round and a partial hand-in.
#
# The next sections are what happens around those rules: one refusal for a cart both outside the group
# and past six, an approved bag handed over after its wearer changed group (marked, beside one that is
# not), a queue place for another group's garment that can't be offered, and a group renamed with the
# garments tagged for it.
#
# Then the cut of uniform somebody is offered — the staff record's Uniform style — asked at every door
# the staff group is asked at, because it is the same rule about a different column: Men's sees the
# men's cut and the unisex range, Women's the women's and the unisex, Either the lot, and blank, which
# is what every record on every register reads until a coordinator says otherwise, is offered
# everything exactly as it is today. Every refusal there sits beside the same ask from somebody whose
# cut it is, and beside a blank record being handed the very garment the refusal is about.
#
# Then the two things that happen to a marked row afterwards, in the same order the staff group's
# sections take them: an approved bag handed over after its wearer was set to another cut, at the
# counter and on the ward round alike (marked, beside one whose wearer was left as she was), and a
# garment issued on the override then split by a hand-in, a return and a swap for another size —
# every half of every split still marked, the new-size row included, beside a garment of the same
# wearer's own cut put through the very same three splits and marked on none of them.
#
# Last, a backup restore that keeps a garment's groups, both marks on every issue row, and the style
# on every staff record.
set -u
B=${BASE:-http://127.0.0.1:3111}
. "$(dirname "$0")/e2e-preflight.sh"; e2e_preflight "$B"
T=${TMP:-/tmp}; J="$T/tc-sets-cj.txt"; W="$T/tc-sets-wearer.txt"; rm -f "$J" "$W"
PASS=0; FAIL=0
ok()   { PASS=$((PASS+1)); echo "  ✓ $1"; }
fail() { FAIL=$((FAIL+1)); echo "  ✗ $1 :: $2"; }
mut()  { curl -s -b "$J" -c "$J" -X POST "$B/api/mutate" -H 'content-type: application/json' -d "{\"op\":\"$1\",\"payload\":$2}"; }
check(){ local name=$1 out=$2 pat=$3; if echo "$out" | grep -q "$pat"; then ok "$name"; else fail "$name" "$(echo "$out" | head -c 300)"; fi; }
no()   { local name=$1 out=$2 pat=$3; if echo "$out" | grep -q "$pat"; then fail "$name" "$(echo "$out" | head -c 300)"; else ok "$name"; fi; }
py()   { python3 -c "import sys,json; d=json.load(sys.stdin); $1"; }
bk()   { curl -s -b "$J" "$B/api/backup"; }
L()    { echo "{\"itemId\":\"$1\",\"si\":0,\"qty\":$2,\"src\":\"$3\"}"; }
issue(){ mut issue.create "{\"staffId\":\"$1\",\"lines\":[$2]${3:-}}"; }
handin(){ mut handin.add "{\"staffId\":\"$1\",\"credit\":false,\"lines\":[{\"itemId\":\"$2\",\"si\":0,\"qty\":1,\"cond\":\"Good\",\"laundered\":true}]}"; }
# What somebody still has of one garment: not returned, not handed in.
held() { bk | py 'print(sum(i["qty"] for i in d["issues"] if i["staffId"]=="'$1'" and i["itemId"]=="'$2'" and not i["handedIn"] and not i["returnedDate"]))'; }
overq(){ bk | py 'print(sum(i["qty"] for i in d["issues"] if i["staffId"]=="'$1'" and i["override"]))'; }
# The facility's three lists as stored, in their stored order: staff groups | FTE table | starting kit.
groups(){ bk | py 'f=d["facility"]; print("|".join(",".join(f[k]) for k in ("staffGroups","nursingGroups","kitGroups")))'; }
CAP='the most anyone holds is 6 sets'

TS=$(date +%s)
check "signup" "$(curl -s -c "$J" -X POST "$B/api/auth/signup" -H 'content-type: application/json' -H "x-forwarded-for: 10.9.$((RANDOM%250)).$((RANDOM%250))" -d "{\"first\":\"Sets\",\"last\":\"Admin\",\"facility\":\"Sets Hospital $TS\",\"email\":\"sets$TS@example.com\",\"password\":\"password123\"}")" '"ok":true'
# A new facility arrives with no staff groups, and with no group on the FTE table or the starting kit:
# any list the product shipped would be one employer's job titles, handed to a hotel. Read before the
# coordinator names them and again after, so a signup that went back to writing a list of its own
# fails here instead of being quietly overwritten by the setup.
check "a brand-new facility has no staff groups, and no group on either route" "$(groups)" '^||$'
check "the coordinator names this facility's groups" "$(e2e_groups "$B" "$J")" '"ok":true'
check "  and they are the facility's from then on" "$(groups)" '^Registered Nurse,Enrolled Nurse,Support Services,Kitchen,Security|Registered Nurse,Enrolled Nurse|Support Services$'
mut supplier.add '{"name":"Alpha Supply"}' >/dev/null
mut dept.save '{"name":"Ward 1","cc":"100"}' >/dev/null
# Types are given outright rather than left to the garment's name, so which half of a set each one is
# never depends on a word in its title.
mut import.rows '{"kind":"catalog","rows":[{"item":"Uniform Top","sku":"UT","type":"Scrub top","supplier":"Alpha Supply","cost":"30","group":"All","sizes":"M"},{"item":"Uniform Pant","sku":"UP","type":"Pants","supplier":"Alpha Supply","cost":"25","group":"All","sizes":"M"},{"item":"Fleece Jacket","sku":"FJ","type":"Fleece","supplier":"Alpha Supply","cost":"50","group":"All","sizes":"M"}]}' >/dev/null
mut import.rows '{"kind":"opening","rows":[{"sku":"UT","size":"M","opening":"60"},{"sku":"UP","size":"M","opening":"60"},{"sku":"FJ","size":"M","opening":"20"}]}' >/dev/null
# Owen is on the starting kit because this facility put Support Services there, not because of any
# word in the name. Ella's register figure of 1 is the old yearly number. It is there to be ignored.
mut import.rows '{"kind":"staff","rows":[{"num":"1","first":"Owen","last":"Ops","group":"Support Services","dept":"Ward 1","top":"M","pants":"M"},{"num":"2","first":"Nora","last":"Nurse","group":"Registered Nurse","dept":"Ward 1","fte":"1.0","top":"M","pants":"M"},{"num":"3","first":"Kira","last":"Kitchen","group":"Kitchen","dept":"Ward 1","top":"M","pants":"M"},{"num":"4","first":"Ella","last":"Kitchen","group":"Kitchen","dept":"Ward 1","ent":"1","top":"M","pants":"M"},{"num":"5","first":"Sam","last":"Guard","group":"Security","dept":"Ward 1","top":"M","pants":"M"}]}' >/dev/null
BK=$(bk)
check "setup: three garments, five people" "$(echo "$BK" | py 'print(len(d["items"]), len(d["staff"]))')" '^3 5$'
sku(){ echo "$BK" | py 'print([i["id"] for i in d["items"] if i["sku"]=="'$1'"][0])'; }
num(){ echo "$BK" | py 'print([s["id"] for s in d["staff"] if s["num"]=="'$1'"][0])'; }
UT=$(sku UT); UP=$(sku UP); FJ=$(sku FJ)
OWEN=$(num 1); NORA=$(num 2); KIRA=$(num 3); ELLA=$(num 4); SAM=$(num 5)

echo "== a new starter's kit is an ordinary issue"
check "Owen, holding nothing, takes his three-set kit" "$(issue "$OWEN" "$(L $UT 3 stock),$(L $UP 3 stock)")" '"stock":6'
check "  and nothing on his record is marked an override" "$(overq "$OWEN")" '^0$'

echo "== six sets held, and not one more — the yearly figure governs nothing"
check "Ella, register figure 1, takes six sets" "$(issue "$ELLA" "$(L $UT 6 stock),$(L $UP 6 stock)")" '"stock":12'
R=$(issue "$ELLA" "$(L $UT 1 stock)")
check "  a seventh top is refused" "$R" "$CAP"
check "  and the refusal says what would make room" "$R" 'Hand a top in'
check "  and wrote nothing" "$(held "$ELLA" "$UT")" '^6$'

echo "== handing one in makes room, credit box unticked"
check "Ella hands a top back" "$(handin "$ELLA" "$UT")" '"good":1'
check "  and the replacement goes through" "$(issue "$ELLA" "$(L $UT 1 stock)")" '"stock":1'
check "  and she is back at six tops" "$(held "$ELLA" "$UT")" '^6$'

echo "== the ceiling bites on each half, not on whole sets"
check "Kira takes six tops and no trousers" "$(issue "$KIRA" "$(L $UT 6 stock)")" '"stock":6'
check "  a seventh top is refused though she holds no whole set" "$(issue "$KIRA" "$(L $UT 1 stock)")" "$CAP"
check "  the other half still has room" "$(issue "$KIRA" "$(L $UP 6 stock)")" '"stock":6'

echo "== nursing is capped like everybody else"
check "Nora, a nurse, is refused a seventh top" "$(issue "$NORA" "$(L $UT 7 order)")" "$CAP"

echo "== an override is real, and recorded"
check "Nora takes seven with the coordinator's override" "$(issue "$NORA" "$(L $UT 7 stock)" ',"override":true')" '"stock":7'
check "  and all seven are marked an override" "$(overq "$NORA")" '^7$'

echo "== garments on order count, across visits"
check "Sam has six tops ordered in" "$(issue "$SAM" "$(L $UT 6 order)")" '"ordered":6'
check "  a top off the shelf on a later visit is refused" "$(issue "$SAM" "$(L $UT 1 stock)")" "$CAP"

echo "== pre-loved counts, and handing pre-loved back frees room"
check "six pre-loved trousers into the pool" "$(mut stock.moves "{\"mode\":\"Pre-loved\",\"lines\":[{\"itemId\":\"$UP\",\"si\":0,\"qty\":6}]}")" '"ok":true'
check "Sam takes six pre-loved trousers" "$(issue "$SAM" "$(L $UP 6 preloved)")" '"preloved":6'
check "  a new pair on top of them is refused" "$(issue "$SAM" "$(L $UP 1 stock)")" "$CAP"
check "Sam hands a pre-loved pair back" "$(handin "$SAM" "$UP")" '"good":1'
check "  and a new pair goes through" "$(issue "$SAM" "$(L $UP 1 stock)")" '"stock":1'

echo "== garments in no set carry their own ceiling"
check "Kira is refused seven fleeces" "$(issue "$KIRA" "$(L $FJ 7 stock)")" 'outside a set is the most anyone holds'
check "  and given six" "$(issue "$KIRA" "$(L $FJ 6 stock)")" '"stock":6'

echo "== the route is the facility's answer, and the wearer is told it"
# Read off Owen's own request screen, which puts the sentence allowance() in lib/sets.ts writes in
# front of a wearer before they ask for anything. His group's place on the lists is the only thing
# moved between the reads below, so the setting is the only thing that can change what he is told.
CODE=$(mut staff.selfCode "{\"id\":\"$OWEN\"}" | py "print(d['result']['code'])")
check "Owen claims his staff account" "$(curl -s -c "$W" -X POST "$B/api/staff/activate" -H 'content-type: application/json' -H "origin: $B" -d "{\"agreed\":true,\"code\":\"$CODE\",\"email\":\"owen$TS@example.com\",\"password\":\"wearerpass1\"}")" '"ok":true'
mine(){ curl -s -b "$W" "$B/my/request"; }
# Four rather than the standing three, so the number on his screen can only have come from this
# facility's own setting.
KIT='4 sets on starting'; SIGNED='each one approved by a manager'; HOURS='hours worked propose the starting number'
check "this facility's starting kit is four sets" "$(mut settings.update '{"initialSets":4}')" '"ok":true'
R=$(mine)
check "Support Services is on the starting kit, so Owen is offered four sets to start" "$R" "$KIT"
no "  and is not told each set waits on a manager" "$R" "$SIGNED"
check "the same group taken off the starting kit" "$(mut settings.update '{"kitGroups":[]}')" '"ok":true'
R=$(mine)
check "  puts Owen on manager approval" "$R" "$SIGNED"
no "  with no starting kit offered" "$R" 'sets on starting'

echo "== one route per group"
check "Support Services goes back on the starting kit" "$(mut settings.update '{"kitGroups":["Support Services"]}')" '"ok":true'
# Spelt the way a roster export spells it, because group names are compared with case and stray spaces
# set aside, and a refusal that only caught an exact match would let one team onto both routes under a
# second spelling. Sent on its own, so it is settled against the starting-kit list already stored.
R=$(mut settings.update '{"nursingGroups":["Registered Nurse","Enrolled Nurse","support services "]}')
check "the FTE table cannot take a group already on the starting kit" "$R" 'can.t be on the FTE table and the starting kit at once'
check "  and the refused save changed neither list" "$(groups)" '|Registered Nurse,Enrolled Nurse|Support Services$'
check "moving it across, both lists in one save, is allowed" "$(mut settings.update '{"nursingGroups":["Registered Nurse","Enrolled Nurse","Support Services"],"kitGroups":[]}')" '"ok":true'
check "  and puts Owen on the FTE table" "$(mine)" "$HOURS"
check "and moving it back the same way" "$(mut settings.update '{"nursingGroups":["Registered Nurse","Enrolled Nurse"],"kitGroups":["Support Services"]}')" '"ok":true'
check "  offers him the starting kit again" "$(mine)" "$KIT"

echo "== renaming a group keeps it on its route"
R=$(mut settings.renameGroup '{"from":"Support Services","to":"Housekeeping"}')
check "Support Services is renamed Housekeeping" "$R" '"ok":true'
check "  moving the one person filed under it" "$R" '"staff":1'
check "  on the facility's list and the starting kit's alike" "$(groups)" '^Registered Nurse,Enrolled Nurse,Housekeeping,Kitchen,Security|Registered Nurse,Enrolled Nurse|Housekeeping$'
check "  and on Owen's record" "$(bk | py "print([s['group'] for s in d['staff'] if s['id']=='$OWEN'][0])")" '^Housekeeping$'
R=$(mine)
check "Owen is still offered the starting kit" "$R" "$KIT"
no "  and the rename did not drop him onto manager approval" "$R" "$SIGNED"
# Renaming onto a name already in use would be two teams under one name, one of them quietly taking
# the other's route.
check "renaming onto a name already in use is refused" "$(mut settings.renameGroup '{"from":"Kitchen","to":"housekeeping"}')" 'already a staff group here'
check "  and Kira is still in Kitchen" "$(bk | py "print([s['group'] for s in d['staff'] if s['id']=='$KIRA'][0])")" '^Kitchen$'

echo "== a group with people in it can't be taken off the list"
# Dropping a group that still has people filed under it would move them all to manager approval with
# nothing on any screen to say so, so the save is refused — while a group nobody is in goes freely.
# The list and Kira's group are read off the facility each time, because the sections above rename.
LIST(){ bk | py 'print(json.dumps(d["facility"]["staffGroups"]))'; }
KGRP=$(bk | py 'print([s["group"] for s in d["staff"] if s["num"]=="3"][0])')
check "an empty group can be added" "$(mut settings.update "{\"staffGroups\":$(LIST | py 'print(json.dumps(d+["Porters"]))')}")" '"ok":true'
check "  and taken off again, with nobody in it" "$(mut settings.update "{\"staffGroups\":$(LIST | py 'print(json.dumps([g for g in d if g!="Porters"]))')}")" '"ok":true'
check "a group with people filed under it is refused" "$(mut settings.update "{\"staffGroups\":$(LIST | KGRP="$KGRP" py 'import os; print(json.dumps([g for g in d if g!=os.environ["KGRP"]]))')}")" 'filed under it'
check "  and stays on the list" "$(LIST)" "$KGRP"

echo "== a garment is for the staff groups it is tagged with"
# The owner's rule: a garment may be tagged for several staff groups, and everybody is offered their
# own group's garments plus those for every group. Everybody below holds nothing when first served and
# asks for one garment at a time, so the ceiling never comes into it — the group is the only thing
# that can refuse any of this, and each refusal has somebody whose group it is for beside it.
check "a garment tagged for two groups and one for a third, off the catalogue CSV" "$(mut import.rows '{"kind":"catalog","rows":[{"item":"Ward Tunic","sku":"WT","type":"Tunic","supplier":"Alpha Supply","cost":"32","group":"Registered Nurse|Enrolled Nurse","sizes":"M"},{"item":"Patrol Shirt","sku":"PS","type":"Shirt","supplier":"Alpha Supply","cost":"28","group":"Security","sizes":"M"}]}')" '"created":2'
mut import.rows '{"kind":"opening","rows":[{"sku":"WT","size":"M","opening":"20"},{"sku":"PS","size":"M","opening":"20"}]}' >/dev/null
# Mara is the manager all three report to, so the staff app has somebody to send their asks to, and
# so she can be seen raising for one of them.
check "four more people, three of them reporting to the fourth" "$(mut import.rows '{"kind":"staff","rows":[{"num":"6","first":"Enzo","last":"Enrolled","group":"Enrolled Nurse","dept":"Ward 1","fte":"1.0","top":"M","pants":"M","manager":"9"},{"num":"7","first":"Rhea","last":"Registered","group":"Registered Nurse","dept":"Ward 1","fte":"1.0","top":"M","pants":"M","manager":"9"},{"num":"8","first":"Gus","last":"Guard","group":"Security","dept":"Ward 1","top":"M","pants":"M","manager":"9"},{"num":"9","first":"Mara","last":"Manager","group":"Registered Nurse","dept":"Ward 1","fte":"1.0"}]}')" '"created":4'
BK=$(bk)
WT=$(sku WT); PS=$(sku PS)
ENZO=$(num 6); RHEA=$(num 7); GUS=$(num 8); MARA=$(num 9)
check "  all three report to Mara" "$(echo "$BK" | py "print(len([s for s in d['staff'] if s['managerId']=='$MARA']))")" '^3$'
# The list as stored and the CSV's own spelling of it beside it, which is what a backup carries.
check "the tunic holds both groups, in the order they were written" "$(echo "$BK" | py "i=[i for i in d['items'] if i['sku']=='WT'][0]; print(','.join(i['groups']), i['group'])")" '^Registered Nurse,Enrolled Nurse Registered Nurse|Enrolled Nurse$'
check "  and the shirt its one" "$(echo "$BK" | py "print(','.join([i['groups'] for i in d['items'] if i['sku']=='PS'][0]))")" '^Security$'

EJ="$T/tc-sets-enzo.txt"; RJ="$T/tc-sets-rhea.txt"; GJ="$T/tc-sets-gus.txt"; MJ="$T/tc-sets-mara.txt"; rm -f "$EJ" "$RJ" "$GJ" "$MJ"
claim(){ local code; code=$(mut staff.selfCode "{\"id\":\"$1\"}" | py "print(d['result']['code'])")
  curl -s -c "$2" -X POST "$B/api/staff/activate" -H 'content-type: application/json' -H "origin: $B" -d "{\"agreed\":true,\"code\":\"$code\",\"email\":\"$3$TS@example.com\",\"password\":\"wearerpass1\"}"; }
smut(){ curl -s -b "$2" -c "$2" -X POST "$B/api/staff/mutate" -H 'content-type: application/json' -H "origin: $B" -d "{\"op\":\"$1\",\"payload\":$3}"; }
check "all four claim staff accounts" "$(printf '%s\n' "$(claim "$ENZO" "$EJ" enzo)" "$(claim "$RHEA" "$RJ" rhea)" "$(claim "$GUS" "$GJ" gus)" "$(claim "$MARA" "$MJ" mara)" | grep -c '"ok":true')" '^4$'

# What each of them is offered to ask for, read off their own request screen. Every "not offered"
# sits beside something the same page does offer, so a page that failed to render fails there.
shop(){ curl -s -b "$1" "$B/my/request"; }
R=$(shop "$EJ")
check "Enzo, an enrolled nurse, is offered the tunic tagged for both nursing groups" "$R" 'Ward Tunic'
check "  and the jacket for every group" "$R" 'Fleece Jacket'
no "  and not the shirt for Security" "$R" 'Patrol Shirt'
R=$(shop "$RJ")
check "Rhea, a registered nurse, is offered the same tunic" "$R" 'Ward Tunic'
no "  and not the shirt for Security either" "$R" 'Patrol Shirt'
R=$(shop "$GJ")
check "Gus, in Security, is offered his own group's shirt" "$R" 'Patrol Shirt'
check "  and the jacket for every group" "$R" 'Fleece Jacket'
no "  and never the nurses' tunic" "$R" 'Ward Tunic'

echo "== the staff app refuses a garment for another group"
ASK(){ echo "{\"lines\":[$1],\"reason\":\"Worn out\"}"; }
RL(){ echo "{\"itemId\":\"$1\",\"si\":0,\"qty\":1}"; }
R=$(smut request.create "$GJ" "$(ASK "$(RL "$WT")")")
check "Gus asking for the nurses' tunic is refused" "$R" 'Ward Tunic is for Registered Nurse, Enrolled Nurse only\. You.re in Security'
no "  and nothing is raised" "$R" '"code"'
R=$(smut request.create "$GJ" "$(ASK "$(RL "$PS"),$(RL "$WT")")")
check "  so is the tunic asked for beside his own shirt" "$R" 'Ward Tunic is for'
no "  and the refusal names only the garment that isn't his" "$R" 'Patrol Shirt is for'
check "his own group's shirt and the jacket for everyone go through" "$(smut request.create "$GJ" "$(ASK "$(RL "$PS"),$(RL "$FJ")")")" '"code"'
check "Enzo asking for the tunic tagged for his group goes through" "$(smut request.create "$EJ" "$(ASK "$(RL "$WT")")")" '"code"'
# Measured against the person it is for, whoever raises it.
check "Mara cannot raise the tunic for Gus" "$(smut request.create "$MJ" "{\"subjectId\":\"$GUS\",\"lines\":[$(RL "$WT")],\"reason\":\"Worn out\"}")" 'Ward Tunic is for Registered Nurse, Enrolled Nurse only\. Gus is in Security\.'
check "  but can raise it for Enzo" "$(smut request.create "$MJ" "{\"subjectId\":\"$ENZO\",\"lines\":[$(RL "$WT")],\"reason\":\"Worn out\"}")" '"code"'
check "Gus cannot queue for the tunic either" "$(smut waitlist.join "$GJ" "{\"itemId\":\"$WT\",\"si\":0}")" 'Ward Tunic is for Registered Nurse, Enrolled Nurse only'
check "  while queueing for his own shirt is allowed" "$(smut waitlist.join "$GJ" "{\"itemId\":\"$PS\",\"si\":0}")" '"id"'

echo "== at the counter it takes the override, recorded apart from the ceiling's"
# Each issue row as SKU=offGroup/override, for one person, sorted by garment.
flags(){ bk | py "sk={i['id']: i['sku'] for i in d['items']}; print(' '.join(sorted('%s=%s/%s' % (sk[r['itemId']], r['offGroup'], r['override']) for r in d['issues'] if r['staffId']=='$1')))"; }
notes(){ bk | py "print(' | '.join(o['notes'] for o in d['orders'] if o['staffId']=='$1'))"; }
R=$(issue "$GUS" "$(L $WT 1 stock)")
check "the tunic is refused to Gus without the override" "$R" 'Ward Tunic is for Registered Nurse, Enrolled Nurse .*Gus Guard is in Security'
check "  and the refusal says what lets it through" "$R" 'Tick the coordinator override'
no "  and is not the ceiling's refusal" "$R" "$CAP"
check "  and wrote nothing" "$(held "$GUS" "$WT")" '^0$'
check "Enzo is handed the same tunic with no override" "$(issue "$ENZO" "$(L $WT 1 stock)")" '"stock":1'
check "  and so is Rhea" "$(issue "$RHEA" "$(L $WT 1 stock)")" '"stock":1'
R=$(issue "$GUS" "$(L $WT 1 stock),$(L $PS 1 stock)" ',"override":true')
check "with the override Gus takes the tunic, and his own shirt beside it" "$R" '"stock":2'
check "  and the counter is told one garment was outside his group" "$R" '"offGroup":1'
# Two garments, well inside six sets: the tunic's row says outside his group, the shirt's says
# nothing, and neither says override — that word stays the ceiling's.
check "  the tunic's row is marked outside his group, and not as an override" "$(flags "$GUS")" '^PS=False/False WT=True/False$'
check "  while Enzo's tunic is marked neither" "$(flags "$ENZO")" '^WT=False/False$'
# Ordered in, there is no issue row to mark yet, so the supplier order carries it.
check "the tunic ordered in for Gus on the override" "$(issue "$GUS" "$(L $WT 1 order)" ',"override":true')" '"ordered":1'
check "  and the supplier order says so, and who allowed it" "$(notes "$GUS")" "Outside Gus.s staff group: Ward Tunic .*override recorded by Sets Admin"
check "Enzo's tunic ordered in the same way" "$(issue "$ENZO" "$(L $WT 1 order)")" '"ordered":1'
check "  carries the ordinary note" "$(notes "$ENZO")" 'Ordered at issue for Enzo Enrolled'
no "  and nothing about a staff group" "$(notes "$ENZO")" 'Outside'
# The same ask refused to him at the top of this section. Holding one now changes nothing: a fresh
# request is measured against his group, whatever the counter handed him on its override, because
# holding another group's garment is no reason to be handed a second one.
R=$(smut request.create "$GJ" "$(ASK "$(RL "$WT")")")
check "once Gus holds the tunic, the staff app still refuses him another" "$R" 'Ward Tunic is for Registered Nurse, Enrolled Nurse only\. You.re in Security'
no "  and nothing is raised" "$R" '"code"'
# The one exemption, and the neighbour that keeps the refusal honest: the very garment he holds,
# reported damaged, is replaced like for like.
GWT=$(bk | py "print([i['id'] for i in d['issues'] if i['staffId']=='$GUS' and i['itemId']=='$WT' and not i['handedIn'] and not i['returnedDate']][0])")
check "  but reporting that tunic torn raises its replacement" "$(smut damage.report "$GJ" "{\"issueId\":\"$GWT\",\"kind\":\"Torn\",\"replace\":true}")" '"replacement":{"id":"[^"]*","code"'

echo "== the phone's one-group label, saved back as it was shown"
# The phone counter's catalogue card sends one group string, and shows a garment with several groups
# as one label. Saving its other fields sends that label straight back, and must leave every group
# in place; picking one group there still moves the garment to it, so the label is not just ignored.
GRPS(){ bk | py "print(','.join([i['groups'] for i in d['items'] if i['id']=='$1'][0]))"; }
check "the tunic saved with its label as shown and a new price" "$(mut catalog.update "{\"id\":\"$WT\",\"group\":\"Registered Nurse, Enrolled Nurse\",\"cost\":33}")" '"ok":true'
check "  took the price" "$(bk | py "print('%g' % [i['cost'] for i in d['items'] if i['id']=='$WT'][0])")" '^33$'
check "  and kept both its groups" "$(GRPS "$WT")" '^Registered Nurse,Enrolled Nurse$'
check "saved with one group picked" "$(mut catalog.update "{\"id\":\"$WT\",\"group\":\"Enrolled Nurse\"}")" '"ok":true'
check "  it is for that group alone" "$(GRPS "$WT")" '^Enrolled Nurse$'
check "the desktop's list puts both back" "$(mut catalog.update "{\"id\":\"$WT\",\"groups\":[\"Registered Nurse\",\"Enrolled Nurse\"]}")" '"ok":true'
check "  and it holds both again" "$(GRPS "$WT")" '^Registered Nurse,Enrolled Nurse$'

echo "== the counter's request door asks the same question"
# request.raise is the linen room raising for somebody without a phone. The hand-over at the end of a
# request trusts that the garments on it are the wearer's group's, so this door has to refuse what the
# staff app refuses — or it is the way round it. It has no override of its own.
reqs(){ bk | py "print(len([r for r in d['requests'] if r['subjectId']=='$1']))"; }
N0=$(reqs "$GUS")
R=$(mut request.raise "{\"staffId\":\"$GUS\",\"lines\":[$(RL "$PS"),$(RL "$WT")],\"reason\":\"Worn out\"}")
check "the counter cannot raise the nurses' tunic for Gus" "$R" 'Ward Tunic is for Registered Nurse, Enrolled Nurse only .*Gus Guard is in Security, and a request can only carry'
check "  and is told the Issue screen's override is the way" "$R" 'on the Issue screen with the coordinator override ticked'
no "  and the refusal names only the garment that isn't his" "$R" 'Patrol Shirt is for'
check "  and raised nothing" "$(reqs "$GUS")" "^$N0\$"
check "his own shirt and the jacket for everyone, raised the same way, go through" "$(mut request.raise "{\"staffId\":\"$GUS\",\"lines\":[$(RL "$PS"),$(RL "$FJ")],\"reason\":\"Worn out\"}")" '"code"'
check "  and are on his record as one request" "$(reqs "$GUS")" "^$((N0+1))\$"

echo "== an order for somebody carries their own group's garments"
# What reaches a person off an order is issued at pickup with nobody deciding anything, so the order
# is where the group is asked. A stock order is for nobody, and may carry anything.
ords(){ bk | py "print(len([o for o in d['orders'] if o['staffId']=='$1']))"; }
OL(){ echo "{\"itemId\":\"$1\",\"size\":\"M\",\"qty\":1}"; }
N0=$(ords "$GUS")
R=$(mut order.create "{\"orderFor\":\"Staff Member\",\"staffId\":\"$GUS\",\"supplier\":\"Alpha Supply\",\"lines\":[$(OL "$WT")]}")
check "an order for Gus carrying the nurses' tunic is refused" "$R" 'Ward Tunic is for Registered Nurse, Enrolled Nurse only .*Gus Guard is in Security, and an order for somebody can only carry'
check "  and is pointed at Order in with the override" "$R" 'use Order in on the Issue screen with the coordinator override ticked'
check "  and wrote no order" "$(ords "$GUS")" "^$N0\$"
R=$(mut order.create "{\"orderFor\":\"Staff Member\",\"staffId\":\"$GUS\",\"supplier\":\"Alpha Supply\",\"lines\":[$(OL "$PS")]}")
check "an order for Gus carrying his own shirt is written" "$R" '"code"'
GD=$(echo "$R" | py "print(d['result']['id'])")
check "  and is his" "$(ords "$GUS")" "^$((N0+1))\$"
# Growing an order is putting a garment on it, and is asked the same question.
check "the tunic can't be added to it afterwards" "$(mut order.lineAdd "{\"id\":\"$GD\",\"itemId\":\"$WT\",\"size\":\"M\",\"qty\":1}")" 'Ward Tunic is for Registered Nurse, Enrolled Nurse only'
check "  while the jacket for everyone can" "$(mut order.lineAdd "{\"id\":\"$GD\",\"itemId\":\"$FJ\",\"size\":\"M\",\"qty\":1}")" '"ok":true'
check "  leaving the shirt and the jacket on it, and no tunic" "$(bk | py "sk={i['id']: i['sku'] for i in d['items']}; print(' '.join(sorted(sk[l['itemId']] for l in [o for o in d['orders'] if o['id']=='$GD'][0]['lines'])))")" '^FJ PS$'
R=$(mut order.create "{\"orderFor\":\"Stock\",\"supplier\":\"Alpha Supply\",\"lines\":[$(OL "$WT")]}")
check "a stock order carries the tunic, being for nobody" "$R" '"code"'
SO=$(echo "$R" | py "print(d['result']['id'])")
FOR(){ bk | py "print([o['orderFor'] for o in d['orders'] if o['id']=='$1'][0])"; }
check "  but can't then be put in Gus's name" "$(mut order.update "{\"id\":\"$SO\",\"staffId\":\"$GUS\"}")" 'Take it off this order first'
check "  and is still a stock order" "$(FOR "$SO")" '^Stock$'
check "  while Enzo's name, whose group it is for, goes on it" "$(mut order.update "{\"id\":\"$SO\",\"staffId\":\"$ENZO\"}")" '"ok":true'
check "  making it his" "$(FOR "$SO")" '^Staff Member$'

echo "== ordered in on the override, the garment is marked when it reaches them"
# Gus's tunic and Enzo's were both ordered in at the counter further up, Gus's on the override. The
# supplier order carries the note; the issue row the collection writes has to carry the mark, or the
# Exceptions report never sees the garment in the month it reached him.
openOrd(){ bk | py "o=[o['id'] for o in d['orders'] if o['staffId']=='$1' and o['status']=='Ordered']; print(o[0] if len(o)==1 else 'expected one open order, found %d' % len(o))"; }
toCounter(){ mut order.receive "{\"id\":\"$1\",\"lines\":$(bk | py "o=[o for o in d['orders'] if o['id']=='$1'][0]; print(json.dumps([{'lineId': l['id'], 'arrived': l['qty'], 'dest': 'pickup'} for l in o['lines']]))")}"; }
puOf(){ bk | py "p=[p['id'] for p in d['pickups'] if p['orderId']=='$1' and not p['pickedUp']]; print(p[0] if p else 'none')"; }
# The issue rows one order turned into, for one person, as SKU=offGroup.
got(){ bk | py "c=[o['code'] for o in d['orders'] if o['id']=='$2'][0]; sk={i['id']: i['sku'] for i in d['items']}; print(' '.join(sorted('%s=%s' % (sk[r['itemId']], r['offGroup']) for r in d['issues'] if r['staffId']=='$1' and r['direct'] and r['orderCode']==c)))"; }
GO=$(openOrd "$GUS"); EO=$(openOrd "$ENZO")
check "Gus's tunic arrives and waits at the counter" "$(toCounter "$GO")" '"ok":true'
check "  and so does Enzo's" "$(toCounter "$EO")" '"ok":true'
check "Gus collects his" "$(mut pickup.pickedUp "{\"id\":\"$(puOf "$GO")\"}")" '"ok":true'
check "  and the issue row it wrote is marked outside his group" "$(got "$GUS" "$GO")" '^WT=True$'
check "Enzo collects his" "$(mut pickup.pickedUp "{\"id\":\"$(puOf "$EO")\"}")" '"ok":true'
check "  and his is marked nothing" "$(got "$ENZO" "$EO")" '^WT=False$'
# The ward round hands over the same way, and marks the same way.
check "another tunic ordered in for Gus on the override" "$(issue "$GUS" "$(L $WT 1 order)" ',"override":true')" '"ordered":1'
check "  and one for Rhea, whose group it is for" "$(issue "$RHEA" "$(L $WT 1 order)")" '"ordered":1'
GO=$(openOrd "$GUS"); RO=$(openOrd "$RHEA")
check "both arrive for the ward round" "$(printf '%s\n' "$(toCounter "$GO")" "$(toCounter "$RO")" | grep -c '"ok":true')" '^2$'
check "both are signed for on the round" "$(printf '%s\n' "$(mut pickup.deliver "{\"id\":\"$(puOf "$GO")\",\"deliveredTo\":\"Ward 1 desk\"}")" "$(mut pickup.deliver "{\"id\":\"$(puOf "$RO")\",\"deliveredTo\":\"Ward 1 desk\"}")" | grep -c '"ok":true')" '^2$'
check "  Gus's row marked outside his group" "$(got "$GUS" "$GO")" '^WT=True$'
check "  and Rhea's not" "$(got "$RHEA" "$RO")" '^WT=False$'

echo "== a partial hand-in keeps the mark on both halves"
# Two of a garment handed over in one act are one issue row; handing one back splits it, and the
# half that stays out and the half that came back were both handed over outside her group. Her own
# group's shirt goes through the same split beside it, so a split that marked everything fails there.
check "one more guard on the register" "$(mut import.rows '{"kind":"staff","rows":[{"num":"10","first":"Tess","last":"Guard","group":"Security","dept":"Ward 1","top":"M","pants":"M"}]}')" '"created":1'
TESS=$(bk | py 'print([s["id"] for s in d["staff"] if s["num"]=="10"][0])')
R=$(issue "$TESS" "$(L $WT 2 stock),$(L $PS 2 stock)" ',"override":true')
check "Tess takes two nurses' tunics on the override, and two of her own shirts" "$R" '"stock":4'
check "  one garment of them outside her group" "$R" '"offGroup":1'
check "she hands one tunic back" "$(handin "$TESS" "$WT")" '"good":1'
check "  and one shirt" "$(handin "$TESS" "$PS")" '"good":1'
# Each issue row as SKU:qty:offGroup:held-or-in.
rows(){ bk | py "sk={i['id']: i['sku'] for i in d['items']}; print(' '.join(sorted('%s:%d:%s:%s' % (sk[r['itemId']], r['qty'], r['offGroup'], 'in' if r['handedIn'] else 'held') for r in d['issues'] if r['staffId']=='$1')))"; }
check "  each row split in two, both halves of the tunic marked and neither half of the shirt" "$(rows "$TESS")" '^PS:1:False:held PS:1:False:in WT:1:True:held WT:1:True:in$'

echo "== a list of groups typed on the phone"
# The phone sends one group string. One matching no garment's label is a list somebody typed, and
# kept whole it would be a single group called "Kitchen, Security" that nobody is in — refusing the
# garment to Kitchen and Security alike. Kira is in Kitchen: before, the shirt is another group's;
# after, what stops her is the six tops she already holds, and nothing about her group.
R=$(issue "$KIRA" "$(L $PS 1 stock)")
check "the shirt is refused to Kira as another group's" "$R" 'Patrol Shirt is for Security .*Kira Kitchen is in Kitchen'
check "the shirt saved from the phone as a group string no garment is labelled with" "$(mut catalog.update "{\"id\":\"$PS\",\"group\":\"Kitchen, Security\"}")" '"ok":true'
check "  is stored as two groups, not one called both" "$(bk | py "print(json.dumps([i['groups'] for i in d['items'] if i['id']=='$PS'][0]))")" '^\["Kitchen", "Security"\]$'
R=$(issue "$KIRA" "$(L $PS 1 stock)")
no "  so Kira is no longer told it is another group's" "$R" 'is for'
check "  only that she already holds six tops" "$R" "$CAP"

echo "== outside the group and past six, in one refusal"
# One override tick answers both questions, so a cart that is both another group's AND past six sets
# has to say both in the one refusal — or ticking the box for the group would wave the ceiling through
# with nobody told. Kira holds six tops and the tunic is a top for the nurses; Tess, beside her, holds
# two, so the same tunic refused to her is the group's refusal alone.
R=$(issue "$KIRA" "$(L $WT 1 stock)")
check "the nurses' tunic for Kira, holding six tops, is refused as another group's" "$R" 'Ward Tunic is for Registered Nurse, Enrolled Nurse .*Kira Kitchen is in Kitchen'
check "  and the same refusal says it would also take her past six" "$R" 'It would also take them past what one person holds'
check "  naming the ceiling" "$R" "$CAP"
check "  and wrote nothing" "$(held "$KIRA" "$WT")" '^0$'
R=$(issue "$TESS" "$(L $WT 1 stock)")
check "the same tunic for Tess, well inside six, is refused as another group's" "$R" 'Ward Tunic is for Registered Nurse, Enrolled Nurse .*Tess Guard is in Security'
no "  with nothing about the ceiling" "$R" 'It would also take them past'

echo "== handed over after the wearer changed group, the garment is marked"
# Both doors that raise a request refuse another group's garment, and a hand-over is not a second
# chance to refuse what a manager approved. So a wearer moved to another group between the ask and the
# collection is still handed it, and the issue row is marked outside their group. Enzo and Rhea both
# ask for the nurses' tunic while it is theirs, one bag each for the counter and one each for the ward
# round; then Enzo is moved to Security and Rhea stays where she is. Each hand-over is read as the one
# new issue row it wrote, as SKU=offGroup/override.
ids(){ bk | py "print(' '.join(i['id'] for i in d['issues'] if i['staffId']=='$1'))"; }
since(){ bk | B4="$2" py "import os; b=set(os.environ['B4'].split()); sk={i['id']: i['sku'] for i in d['items']}; print(' '.join(sorted('%s=%s/%s' % (sk[r['itemId']], r['offGroup'], r['override']) for r in d['issues'] if r['staffId']=='$1' and r['id'] not in b)))"; }
rid(){ echo "$1" | py "print(d['result']['id'])" 2>/dev/null; }
Q1=$(smut request.create "$EJ" "$(ASK "$(RL "$WT")")"); Q2=$(smut request.create "$EJ" "$(ASK "$(RL "$WT")")")
Q3=$(smut request.create "$RJ" "$(ASK "$(RL "$WT")")"); Q4=$(smut request.create "$RJ" "$(ASK "$(RL "$WT")")")
check "Enzo asks for the tunic twice, and so does Rhea" "$(printf '%s\n' "$Q1" "$Q2" "$Q3" "$Q4" | grep -c '"code"')" '^4$'
EC=$(rid "$Q1"); ER=$(rid "$Q2"); RC=$(rid "$Q3"); RR=$(rid "$Q4")
check "  and Mara approves all four" "$(for r in $EC $ER $RC $RR; do smut request.approve "$MJ" "{\"id\":\"$r\"}"; echo; done | grep -c '"status":"accepted"')" '^4$'
check "Mara takes the ward-desk flag, so the round has somebody on Ward 1 to sign" "$(mut staff.patch "{\"id\":\"$MARA\",\"wardDesk\":true}")" '"ok":true'
check "the linen room picks all four" "$(for r in $EC $ER $RC $RR; do mut request.pick "{\"id\":\"$r\"}"; echo; done | grep -c '"status":"picking"')" '^4$'
check "  holds one of each at the counter" "$(for r in $EC $RC; do mut request.hold "{\"id\":\"$r\"}"; echo; done | grep -c '"status":"ready"')" '^2$'
check "  and sends the other two on the round" "$(for r in $ER $RR; do mut request.round "{\"id\":\"$r\"}"; echo; done | grep -c '"status":"round"')" '^2$'
# Queued for the same tunic while it is theirs, for the waitlist section below.
WQE=$(smut waitlist.join "$EJ" "{\"itemId\":\"$WT\",\"si\":0}"); WQR=$(smut waitlist.join "$RJ" "{\"itemId\":\"$WT\",\"si\":0}")
check "both queue for the tunic too, while it is their group's" "$(printf '%s\n' "$WQE" "$WQR" | grep -c '"id"')" '^2$'
# staff.patch carries no group; the staff record's own save is what moves somebody to another group.
check "Enzo is moved to Security" "$(mut staff.save "{\"id\":\"$ENZO\",\"num\":\"6\",\"first\":\"Enzo\",\"last\":\"Enrolled\",\"group\":\"Security\",\"dept\":\"Ward 1\",\"top\":\"M\",\"pants\":\"M\"}")" '"ok":true'
check "  and is in it" "$(bk | py "print([s['group'] for s in d['staff'] if s['id']=='$ENZO'][0])")" '^Security$'
E0=$(ids "$ENZO"); R0=$(ids "$RHEA")
check "Enzo collects his bag at the counter" "$(mut request.collected "{\"id\":\"$EC\"}")" '"status":"collected"'
check "  and its row is marked outside his group, and not as an override" "$(since "$ENZO" "$E0")" '^WT=True/False$'
check "Rhea collects hers" "$(mut request.collected "{\"id\":\"$RC\"}")" '"status":"collected"'
check "  and hers is marked neither" "$(since "$RHEA" "$R0")" '^WT=False/False$'
E0=$(ids "$ENZO"); R0=$(ids "$RHEA")
check "Mara signs for Enzo's bag on the round" "$(smut round.sign "$MJ" "{\"id\":\"$ER\"}")" '"ok":true'
check "  and its row is marked outside his group" "$(since "$ENZO" "$E0")" '^WT=True/False$'
check "and for Rhea's" "$(smut round.sign "$MJ" "{\"id\":\"$RR\"}")" '"ok":true'
check "  and hers is not" "$(since "$RHEA" "$R0")" '^WT=False/False$'

echo "== a place in the queue for another group's garment isn't offered"
# Joining is refused for another group's garment, but a place joined while it was theirs outlives a
# move to another group. Offering it would hold the stock for forty-eight hours for somebody whose
# acceptance is then refused, so the offer is refused — beside Rhea's place for the same tunic.
WE=$(rid "$WQE"); WR=$(rid "$WQR")
offered(){ bk | py "print([w['offeredAt'] is not None for w in d['waitlist'] if w['id']=='$1'][0])"; }
R=$(mut waitlist.offer "{\"id\":\"$WE\"}")
check "the tunic can't be offered to Enzo's place, now he is in Security" "$R" 'Ward Tunic is for Registered Nurse, Enrolled Nurse only .*Enzo Enrolled is in Security, so they can.t take it'
check "  and the linen room is told to take him off the list" "$R" 'Take them off this waitlist instead'
check "  and his place is not marked offered" "$(offered "$WE")" '^False$'
check "Rhea's place for the same tunic is offered" "$(mut waitlist.offer "{\"id\":\"$WR\"}")" '"heldUntil"'
check "  and marked offered" "$(offered "$WR")" '^True$'

echo "== a renamed group takes its garments with it"
# Garments tagged for a group are renamed with it. Left under the old name they would be for a group
# nobody is in any more, and the person the garment is for would need the override to be handed it.
check "a cap for Security alone, off the catalogue CSV" "$(mut import.rows '{"kind":"catalog","rows":[{"item":"Guard Cap","sku":"GC","type":"Hat","supplier":"Alpha Supply","cost":"12","group":"Security","sizes":"M"}]}')" '"created":1'
mut import.rows '{"kind":"opening","rows":[{"sku":"GC","size":"M","opening":"10"}]}' >/dev/null
GC=$(bk | py 'print([i["id"] for i in d["items"] if i["sku"]=="GC"][0])')
R=$(mut settings.renameGroup '{"from":"Security","to":"Protective Services"}')
check "Security is renamed Protective Services" "$R" '"ok":true'
check "  moving both garments tagged for it, the cap and the shirt" "$R" '"garments":2'
check "  the cap, read back off the backup, is for the new name" "$(GRPS "$GC")" '^Protective Services$'
check "  the shirt keeps Kitchen beside the new name" "$(GRPS "$PS")" '^Kitchen,Protective Services$'
check "  and the tunic, for neither, is untouched" "$(GRPS "$WT")" '^Registered Nurse,Enrolled Nurse$'
check "  and Tess is filed under the new name" "$(bk | py "print([s['group'] for s in d['staff'] if s['id']=='$TESS'][0])")" '^Protective Services$'
check "Tess, in the renamed group, is handed the cap with no override" "$(issue "$TESS" "$(L $GC 1 stock)")" '"stock":1'
check "  and its row is marked neither outside her group nor as an override" "$(bk | py "print(' '.join('%s/%s' % (r['offGroup'], r['override']) for r in d['issues'] if r['staffId']=='$TESS' and r['itemId']=='$GC'))")" '^False/False$'
R=$(issue "$RHEA" "$(L $GC 1 stock)")
check "while Rhea, a nurse, is refused it under its new name" "$R" 'Guard Cap is for Protective Services .*Rhea Registered is in Registered Nurse'
check "  and wrote nothing" "$(held "$RHEA" "$GC")" '^0$'

echo "== the cut of uniform a wearer is offered"
# The owner's second rule, and deliberately the same shape as the staff group above: the staff record
# carries a Uniform style — Men's, Women's or Either — and each garment carries a cut. Somebody set to
# Men's is offered the men's cut and the unisex range, somebody set to Women's the women's and the
# unisex, somebody set to Either every cut. Blank is the fourth state and the one every record on
# every register reads until a coordinator sets it: nobody has said, and nothing is refused.
#
# The people below are new to the register and hold nothing, and each asks for one or two garments at
# a time against a ceiling of six, so the ceiling never comes into any of this — the cut is the only
# thing that can refuse anything here, and each refusal sits beside the same ask from somebody whose
# cut it is. Kitchen and the two nursing groups are used throughout because the renames above leave
# them under the names they were given at the top of the file.
#
# The types are given outright: the blouse and both shirts are tops, so the two cuts sit in the same
# half of a set and nothing below turns on which bucket a garment fell into.
check "a women's cut, a men's cut, and a women's cut for the nurses alone" "$(mut import.rows '{"kind":"catalog","rows":[{"item":"Ward Blouse","sku":"WB","type":"Blouse","gender":"Female","supplier":"Alpha Supply","cost":"36","group":"All","sizes":"M"},{"item":"Field Shirt","sku":"FS","type":"Shirt","gender":"Male","supplier":"Alpha Supply","cost":"34","group":"All","sizes":"M"},{"item":"Theatre Scrub Top","sku":"TT","type":"Scrub top","gender":"Female","supplier":"Alpha Supply","cost":"33","group":"Registered Nurse|Enrolled Nurse","sizes":"M"}]}')" '"created":3'
mut import.rows '{"kind":"opening","rows":[{"sku":"WB","size":"M","opening":"20"},{"sku":"FS","size":"M","opening":"20"},{"sku":"TT","size":"M","opening":"20"}]}' >/dev/null
# Four more people, their cuts written in the register CSV's own column and in the spellings a file
# actually arrives in — "Mens" without the apostrophe, "both" for the one who sees everything — so a
# rule that only matched the words a picker offers fails here. Dana's and Robin's cells are empty,
# which is every record on every register today.
check "four more people, two of them with a cut on the file" "$(mut import.rows '{"kind":"staff","rows":[{"num":"11","first":"Dana","last":"Lee","group":"Kitchen","dept":"Ward 1","top":"M","pants":"M","manager":"9"},{"num":"12","first":"Milo","last":"Reed","group":"Kitchen","dept":"Ward 1","top":"M","pants":"M","manager":"9","style":"Mens"},{"num":"13","first":"Ash","last":"Quinn","group":"Kitchen","dept":"Ward 1","top":"M","pants":"M","manager":"9","style":"both"},{"num":"14","first":"Robin","last":"Vale","group":"Kitchen","dept":"Ward 1","top":"M","pants":"M","manager":"9"}]}')" '"created":4'
BK=$(bk)
WB=$(sku WB); FS=$(sku FS); TT=$(sku TT)
DANA=$(num 11); MILO=$(num 12); ASH=$(num 13); ROBIN=$(num 14)
# One person's cut as stored, in brackets, so blank — nobody has said — is something a check can name
# rather than an empty string that matches anything.
styleOf(){ bk | py "print('[' + [s['uniformStyle'] for s in d['staff'] if s['id']=='$1'][0] + ']')"; }
# Each issue row as SKU=offStyle/override, for one person, sorted by garment: the flags() above with
# the cut's mark in place of the group's, because the two are recorded apart and neither is `override`.
sflags(){ bk | py "sk={i['id']: i['sku'] for i in d['items']}; print(' '.join(sorted('%s=%s/%s' % (sk[r['itemId']], r['offStyle'], r['override']) for r in d['issues'] if r['staffId']=='$1')))"; }
check "the blouse is the women's cut, the shirt the men's, the theatre top the women's" "$(echo "$BK" | py "print(' '.join(sorted(i['sku'] + '=' + i['gender'] for i in d['items'] if i['sku'] in ('WB', 'FS', 'TT'))))")" '^FS=Male TT=Female WB=Female$'
check "Milo's cut, written Mens in the file, is stored as the style itself" "$(styleOf "$MILO")" "^\[Men.s\]$"
check "  and Ash's, written both, as the one that sees every cut" "$(styleOf "$ASH")" '^\[Either\]$'
check "  while Dana and Robin, whose cells were empty, are blank" "$(printf '%s%s' "$(styleOf "$DANA")" "$(styleOf "$ROBIN")")" '^\[\]\[\]$'
DJ="$T/tc-sets-dana.txt"; MIJ="$T/tc-sets-milo.txt"; AJ="$T/tc-sets-ash.txt"; rm -f "$DJ" "$MIJ" "$AJ"
check "three of them claim staff accounts" "$(printf '%s\n' "$(claim "$DANA" "$DJ" dana)" "$(claim "$MILO" "$MIJ" milo)" "$(claim "$ASH" "$AJ" ash)" | grep -c '"ok":true')" '^3$'

echo "== blank is what every register reads today, and it is offered everything"
# Nothing may change for a record nobody has set. Dana is blank here and is offered, and handed, the
# men's cut — the very garment she is refused further down, once a coordinator has said which cut she
# wears. Both reads are of the same person and the same garment, so the only thing between them is
# the field.
R=$(shop "$DJ")
check "Dana, blank, is offered the men's shirt on her own request screen" "$R" 'Field Shirt'
check "  and the women's blouse beside it" "$R" 'Ward Blouse'
check "Dana is handed the men's shirt at the counter with no override" "$(issue "$DANA" "$(L $FS 1 stock)")" '"stock":1'
check "  and its row is marked neither the wrong cut nor an override" "$(sflags "$DANA")" '^FS=False/False$'
# Joined while nobody had said which cut she wears, for the offer section below.
WSD=$(smut waitlist.join "$DJ" "{\"itemId\":\"$FS\",\"si\":0}")
check "  and she takes a place in the queue for one" "$WSD" '"id"'
WSM=$(smut waitlist.join "$MIJ" "{\"itemId\":\"$FS\",\"si\":0}")
check "Milo, set to Men's, queues for the same shirt" "$WSM" '"id"'

echo "== set to Women's, the counter refuses the men's cut without the override"
check "the coordinator sets Dana to Women's" "$(mut staff.patch "{\"id\":\"$DANA\",\"uniformStyle\":\"Women's\"}")" '"ok":true'
check "  and it is on her record" "$(styleOf "$DANA")" "^\[Women.s\]$"
# A style nothing recognises would be stored and then read as blank, quietly offering her everything
# while the screen showed a decision somebody thought they had made.
check "a word the rule doesn't know is refused rather than stored" "$(mut staff.patch "{\"id\":\"$DANA\",\"uniformStyle\":\"whatever the ward says\"}")" 'Uniform style has to be'
check "  and she is still set to Women's" "$(styleOf "$DANA")" "^\[Women.s\]$"
check "Dana takes the women's blouse with no override" "$(issue "$DANA" "$(L $WB 1 stock)")" '"stock":1'
check "  and the jacket worn in every cut" "$(issue "$DANA" "$(L $FJ 1 stock)")" '"stock":1'
R=$(issue "$DANA" "$(L $FS 1 stock)")
check "the men's shirt is refused to her" "$R" "Field Shirt is the Men.s cut — Dana Lee is set to Women.s"
check "  and the refusal says what lets it through" "$R" 'Tick the coordinator override'
no "  and is not the ceiling's refusal" "$R" "$CAP"
# One: the shirt she was handed before anybody set her cut. A refusal that wrote anyway reads two.
check "  and wrote nothing" "$(held "$DANA" "$FS")" '^1$'
check "Milo, whose cut it is, is handed the same shirt with no override" "$(issue "$MILO" "$(L $FS 1 stock)")" '"stock":1'
check "  and his row is marked neither" "$(sflags "$MILO")" '^FS=False/False$'

echo "== at the counter the cut takes the override, recorded apart from the ceiling's"
R=$(issue "$DANA" "$(L $FS 1 stock),$(L $WB 1 stock)" ',"override":true')
check "with the override Dana takes the men's shirt, and her own blouse beside it" "$R" '"stock":2'
check "  and the counter is told one garment was not her cut" "$R" '"offStyle":1'
# Two garments, well inside six sets: the shirt's row says the wrong cut, the blouse's says nothing,
# and neither says override — that word stays the ceiling's.
check "  the shirt's row alone is marked the wrong cut, and nothing is marked an override" "$(sflags "$DANA")" '^FJ=False/False FS=False/False FS=True/False WB=False/False WB=False/False$'

echo "== the staff app lists her own cut and the unisex range, and refuses the rest"
R=$(shop "$DJ")
check "Dana's request screen offers the women's blouse" "$R" 'Ward Blouse'
check "  and the jacket worn in every cut" "$R" 'Fleece Jacket'
no "  and not the men's shirt, though she is holding two" "$R" 'Field Shirt'
R=$(smut request.create "$DJ" "$(ASK "$(RL "$FS")")")
check "asking for the men's shirt is refused" "$R" "Field Shirt is the Men.s cut\. You.re set to Women.s"
no "  and nothing is raised" "$R" '"code"'
check "her own blouse goes through" "$(smut request.create "$DJ" "$(ASK "$(RL "$WB")")")" '"code"'
check "Milo asking for the shirt in his own cut goes through" "$(smut request.create "$MIJ" "$(ASK "$(RL "$FS")")")" '"code"'
# Measured against the person it is for, whoever raises it.
check "Mara cannot raise the men's shirt for Dana" "$(smut request.create "$MJ" "{\"subjectId\":\"$DANA\",\"lines\":[$(RL "$FS")],\"reason\":\"Worn out\"}")" "Field Shirt is the Men.s cut\. Dana is set to Women.s\."
check "  but can raise the blouse for her" "$(smut request.create "$MJ" "{\"subjectId\":\"$DANA\",\"lines\":[$(RL "$WB")],\"reason\":\"Worn out\"}")" '"code"'
check "Dana cannot queue for the men's shirt now" "$(smut waitlist.join "$DJ" "{\"itemId\":\"$FS\",\"si\":0}")" "Field Shirt is the Men.s cut"
check "  while queueing for the blouse is allowed" "$(smut waitlist.join "$DJ" "{\"itemId\":\"$WB\",\"si\":0}")" '"id"'

echo "== the counter's request door and every order for her ask the same question"
N0=$(reqs "$DANA")
R=$(mut request.raise "{\"staffId\":\"$DANA\",\"lines\":[$(RL "$WB"),$(RL "$FS")],\"reason\":\"Worn out\"}")
check "the counter cannot raise the men's shirt for Dana" "$R" "Field Shirt is the Men.s cut — Dana Lee is set to Women.s, and a request can only carry their own style"
check "  and is told the Issue screen's override is the way" "$R" 'on the Issue screen with the coordinator override ticked'
no "  and the refusal names only the garment that isn't her cut" "$R" 'Ward Blouse is the'
check "  and raised nothing" "$(reqs "$DANA")" "^$N0\$"
check "her blouse and the jacket for every cut, raised the same way, go through" "$(mut request.raise "{\"staffId\":\"$DANA\",\"lines\":[$(RL "$WB"),$(RL "$FJ")],\"reason\":\"Worn out\"}")" '"code"'
O0=$(ords "$DANA")
R=$(mut order.create "{\"orderFor\":\"Staff Member\",\"staffId\":\"$DANA\",\"supplier\":\"Alpha Supply\",\"lines\":[$(OL "$FS")]}")
check "an order for Dana carrying the men's shirt is refused" "$R" "Field Shirt is the Men.s cut — Dana Lee is set to Women.s, and an order for somebody can only carry their own style"
check "  and is pointed at Order in with the override" "$R" 'use Order in on the Issue screen with the coordinator override ticked'
check "  and wrote no order" "$(ords "$DANA")" "^$O0\$"
R=$(mut order.create "{\"orderFor\":\"Staff Member\",\"staffId\":\"$DANA\",\"supplier\":\"Alpha Supply\",\"lines\":[$(OL "$WB")]}")
check "an order for Dana carrying her own blouse is written" "$R" '"code"'
DD=$(echo "$R" | py "print(d['result']['id'])")
check "the men's shirt can't be added to it afterwards" "$(mut order.lineAdd "{\"id\":\"$DD\",\"itemId\":\"$FS\",\"size\":\"M\",\"qty\":1}")" "Field Shirt is the Men.s cut"
check "  while the jacket for every cut can" "$(mut order.lineAdd "{\"id\":\"$DD\",\"itemId\":\"$FJ\",\"size\":\"M\",\"qty\":1}")" '"ok":true'
R=$(mut order.create "{\"orderFor\":\"Stock\",\"supplier\":\"Alpha Supply\",\"lines\":[$(OL "$FS")]}")
check "a stock order carries the men's shirt, being for nobody" "$R" '"code"'
SS=$(echo "$R" | py "print(d['result']['id'])")
check "  but can't then be put in Dana's name" "$(mut order.update "{\"id\":\"$SS\",\"staffId\":\"$DANA\"}")" 'Take it off this order first'
check "  and is still a stock order" "$(FOR "$SS")" '^Stock$'
check "  while Milo's name, whose cut it is, goes on it" "$(mut order.update "{\"id\":\"$SS\",\"staffId\":\"$MILO\"}")" '"ok":true'
check "  making it his" "$(FOR "$SS")" '^Staff Member$'

echo "== ordered in on the override, the cut is marked when the garment reaches her"
# There is no issue row to mark when a garment is ordered in, so the supplier order carries it; the
# row the collection writes has to carry the mark, or the Exceptions report never sees the garment in
# the month it reached her. Both orders below are the only open ones each of them has.
check "the men's shirt ordered in for Dana on the override" "$(issue "$DANA" "$(L $FS 1 order)" ',"override":true')" '"ordered":1'
check "  and the supplier order says whose cut it isn't, and who allowed it" "$(notes "$DANA")" "Not Dana.s uniform style: Field Shirt .*override recorded by Sets Admin"
check "one ordered in for Milo, whose cut it is" "$(issue "$MILO" "$(L $FS 1 order)")" '"ordered":1'
check "  carries the ordinary note" "$(notes "$MILO")" 'Ordered at issue for Milo Reed'
no "  and nothing about a uniform style" "$(notes "$MILO")" 'uniform style'
# The issue rows one order turned into, for one person, as SKU=offStyle.
gotS(){ bk | py "c=[o['code'] for o in d['orders'] if o['id']=='$2'][0]; sk={i['id']: i['sku'] for i in d['items']}; print(' '.join(sorted('%s=%s' % (sk[r['itemId']], r['offStyle']) for r in d['issues'] if r['staffId']=='$1' and r['direct'] and r['orderCode']==c)))"; }
DO=$(openOrd "$DANA"); MO=$(openOrd "$MILO")
check "Dana's shirt arrives and waits at the counter" "$(toCounter "$DO")" '"ok":true'
check "  and so does Milo's" "$(toCounter "$MO")" '"ok":true'
check "Dana collects hers" "$(mut pickup.pickedUp "{\"id\":\"$(puOf "$DO")\"}")" '"ok":true'
check "  and the issue row it wrote is marked the wrong cut" "$(gotS "$DANA" "$DO")" '^FS=True$'
check "Milo collects his" "$(mut pickup.pickedUp "{\"id\":\"$(puOf "$MO")\"}")" '"ok":true'
check "  and his is marked nothing" "$(gotS "$MILO" "$MO")" '^FS=False$'

echo "== a place in the queue for another cut isn't offered"
# Joining is refused for another cut, but Dana's place was joined before anybody had said which cut
# she wears and outlives the decision. Offering it would hold the stock for forty-eight hours for
# somebody whose acceptance her own request door now refuses — beside Milo's place for the same shirt.
WD=$(rid "$WSD"); WM=$(rid "$WSM")
R=$(mut waitlist.offer "{\"id\":\"$WD\"}")
check "the men's shirt can't be offered to Dana's place, now she is set to Women's" "$R" "Field Shirt is the Men.s cut — Dana Lee is set to Women.s, so they can.t take it"
check "  and the linen room is told to take her off the list" "$R" 'Take them off this waitlist instead'
check "  and her place is not marked offered" "$(offered "$WD")" '^False$'
check "Milo's place for the same shirt is offered" "$(mut waitlist.offer "{\"id\":\"$WM\"}")" '"heldUntil"'
check "  and marked offered" "$(offered "$WM")" '^True$'

echo "== Either sees both cuts, and so does a record nobody has set"
R=$(issue "$ASH" "$(L $WB 1 stock),$(L $FS 1 stock)")
check "Ash, set to Either, takes the women's blouse and the men's shirt in one cart, no override" "$R" '"stock":2'
check "  and the counter is told neither was the wrong cut" "$R" '"offStyle":0'
R=$(shop "$AJ")
check "  his request screen offers the women's blouse" "$R" 'Ward Blouse'
check "  and the men's shirt beside it" "$R" 'Field Shirt'
check "Robin, whom nobody has set, is handed the women's blouse with no override" "$(issue "$ROBIN" "$(L $WB 1 stock)")" '"stock":1'
check "  and his record is still blank rather than quietly decided for him" "$(styleOf "$ROBIN")" '^\[\]$'

echo "== another group's garment and another cut, in one refusal"
# One override tick answers both questions, so a cart that is both has to say both in the one refusal
# — or ticking the box for the cut would wave the group through with nobody told. The theatre top is
# the nurses', in the women's cut; Milo is in Kitchen and set to Men's, so it is wrong on both counts.
# Mara, a nurse nobody has set a cut for, is handed the same garment beside him.
R=$(issue "$MILO" "$(L $TT 1 stock)")
check "the nurses' women's-cut top is refused to Milo as another group's" "$R" 'Theatre Scrub Top is for Registered Nurse, Enrolled Nurse — Milo Reed is in Kitchen'
check "  and, in the same refusal, as another cut" "$R" "Theatre Scrub Top is the Women.s cut — Milo Reed is set to Men.s"
check "  asking for the tick once, for the one garment" "$(echo "$R" | grep -o 'Tick the coordinator override to issue it anyway' | wc -l | tr -d ' ')" '^1$'
no "  with nothing about the ceiling" "$R" 'It would also take them past'
check "  and wrote nothing" "$(held "$MILO" "$TT")" '^0$'
check "Mara, a nurse with no cut set, is handed the same top with no override" "$(issue "$MARA" "$(L $TT 1 stock)")" '"stock":1'

echo "== the cut survives the register CSV the settings screen imports"
# The Settings screen parses the file and posts the rows through import.rows, so the round trip worth
# testing is the template's own header row and example line, read out of csv.ts and put through that
# same op. A style column added to one and not the other, or an example the importer can't read,
# fails here rather than on a coordinator's first real file.
CSVH=$(sed -n 's/^[[:space:]]*staff:.*headers: "\([^"]*\)".*$/\1/p' "$(dirname "$0")/../lib/csv.ts")
CSVX=$(sed -n 's/^[[:space:]]*staff:.*example: `\([^`]*\)`.*$/\1/p' "$(dirname "$0")/../lib/csv.ts")
check "the staff template names a style column" "$(echo ",$CSVH,")" ',style,'
check "  and its header row and example line are the same width" "$(HDR="$CSVH" EX="$CSVX" python3 -c 'import csv, io, os; print(len(next(csv.reader(io.StringIO(os.environ["HDR"])))), len(next(csv.reader(io.StringIO(os.environ["EX"])))))')" '^16 16$'
ROW=$(HDR="$CSVH" EX="$CSVX" python3 -c 'import csv, io, json, os; h=next(csv.reader(io.StringIO(os.environ["HDR"]))); x=next(csv.reader(io.StringIO(os.environ["EX"]))); r=dict(zip(h, x)); r["num"]="15"; r["manager"]="9"; print(json.dumps(r))')
check "the template's own example row imports" "$(mut import.rows "{\"kind\":\"staff\",\"rows\":[$ROW]}")" '"created":1'
FIF=$(bk | py 'print([s["id"] for s in d["staff"] if s["num"]=="15"][0])')
check "  carrying the cut the example writes" "$(styleOf "$FIF")" "^\[Women.s\]$"
check "the same person re-imported with the style cell empty" "$(mut import.rows '{"kind":"staff","rows":[{"num":"15","first":"Mara","last":"Whitfield","style":""}]}')" '"updated":1'
check "  keeps the cut that was there, as every blank cell does" "$(styleOf "$FIF")" "^\[Women.s\]$"
# A register exported from a payroll or a roster writes this column as a gender, and that is the file
# this gets loaded from, so those spellings land on a style instead of being turned away.
check "a register exported with a gender column reads as a cut" "$(mut import.rows '{"kind":"staff","rows":[{"num":"16","first":"Noor","last":"Haddad","group":"Kitchen","dept":"Ward 1","top":"M","pants":"M","gender":"F"}]}')" '"created":1'
check "  and she is set to Women's" "$(styleOf "$(bk | py 'print([s["id"] for s in d["staff"] if s["num"]=="16"][0])')")" "^\[Women.s\]$"
R=$(mut import.rows '{"kind":"staff","rows":[{"num":"17","first":"Rae","last":"Okonkwo","group":"Kitchen","dept":"Ward 1","top":"M","pants":"M","style":"whatever the ward says"}]}')
check "a cell the rule can't read is reported rather than guessed at" "$R" "isn.t Men.s, Women.s, Either or blank"
check "  and the row is imported all the same" "$R" '"created":1'
RAE=$(bk | py 'print([s["id"] for s in d["staff"] if s["num"]=="17"][0])')
check "  with the cut left blank" "$(styleOf "$RAE")" '^\[\]$'
check "  so nothing is refused to her at the counter" "$(issue "$RAE" "$(L $FS 1 stock)")" '"stock":1'

echo "== handed over after the wearer was set to another cut, the garment is marked"
# The same shape as the staff-group section above, and there for the same reason: both doors that
# raise a request refuse another cut, and a hand-over is not a second chance to refuse what a manager
# approved. So somebody set to a cut between the ask and the collection is still handed the bag, and
# the issue row is marked the wrong cut. Vera and Nell each ask for the women's blouse twice while it
# is theirs — one bag apiece for the counter and one apiece for the ward round — and then Vera is set
# to Men's and Nell is left exactly as she was.
#
# The blouse is for every staff group and neither of them ends up holding more than two of it, so
# neither the group rule nor the six-set ceiling can mark anything here: the cut is the only thing
# between the two readings, and every row is read for all three marks rather than the one.
check "two more in Kitchen, both set to Women's, reporting to Mara" "$(mut import.rows "{\"kind\":\"staff\",\"rows\":[{\"num\":\"18\",\"first\":\"Vera\",\"last\":\"Pike\",\"group\":\"Kitchen\",\"dept\":\"Ward 1\",\"top\":\"M\",\"pants\":\"M\",\"manager\":\"9\",\"style\":\"Women's\"},{\"num\":\"19\",\"first\":\"Nell\",\"last\":\"Ross\",\"group\":\"Kitchen\",\"dept\":\"Ward 1\",\"top\":\"M\",\"pants\":\"M\",\"manager\":\"9\",\"style\":\"Women's\"}]}")" '"created":2'
VERA=$(bk | py 'print([s["id"] for s in d["staff"] if s["num"]=="18"][0])')
NELL=$(bk | py 'print([s["id"] for s in d["staff"] if s["num"]=="19"][0])')
check "  and the register carries the cut for both of them" "$(printf '%s%s' "$(styleOf "$VERA")" "$(styleOf "$NELL")")" "^\[Women.s\]\[Women.s\]$"
VJ="$T/tc-sets-vera.txt"; NJ="$T/tc-sets-nell.txt"; rm -f "$VJ" "$NJ"
check "both claim staff accounts" "$(printf '%s\n' "$(claim "$VERA" "$VJ" vera)" "$(claim "$NELL" "$NJ" nell)" | grep -c '"ok":true')" '^2$'
# Each new issue row as SKU=offStyle/offGroup/override: since() above with the cut's mark first and
# the other two beside it, because a hand-over that stamped the staff group's flag or the ceiling's
# instead of the cut's would otherwise read as a pass.
sinceS(){ bk | B4="$2" py "import os; b=set(os.environ['B4'].split()); sk={i['id']: i['sku'] for i in d['items']}; print(' '.join(sorted('%s=%s/%s/%s' % (sk[r['itemId']], r['offStyle'], r['offGroup'], r['override']) for r in d['issues'] if r['staffId']=='$1' and r['id'] not in b)))"; }
V1=$(smut request.create "$VJ" "$(ASK "$(RL "$WB")")"); V2=$(smut request.create "$VJ" "$(ASK "$(RL "$WB")")")
N1=$(smut request.create "$NJ" "$(ASK "$(RL "$WB")")"); N2=$(smut request.create "$NJ" "$(ASK "$(RL "$WB")")")
check "Vera asks for the women's blouse twice while it is her cut, and so does Nell" "$(printf '%s\n' "$V1" "$V2" "$N1" "$N2" | grep -c '"code"')" '^4$'
VC=$(rid "$V1"); VR=$(rid "$V2"); NC=$(rid "$N1"); NR=$(rid "$N2")
check "  and Mara approves all four" "$(for r in $VC $VR $NC $NR; do smut request.approve "$MJ" "{\"id\":\"$r\"}"; echo; done | grep -c '"status":"accepted"')" '^4$'
check "the linen room picks all four" "$(for r in $VC $VR $NC $NR; do mut request.pick "{\"id\":\"$r\"}"; echo; done | grep -c '"status":"picking"')" '^4$'
check "  holds one of each at the counter" "$(for r in $VC $NC; do mut request.hold "{\"id\":\"$r\"}"; echo; done | grep -c '"status":"ready"')" '^2$'
check "  and sends the other two on the round" "$(for r in $VR $NR; do mut request.round "{\"id\":\"$r\"}"; echo; done | grep -c '"status":"round"')" '^2$'
# staff.patch is the control the cut has of its own, and the one the sections above set a cut with.
check "the coordinator sets Vera to Men's, her bags already picked" "$(mut staff.patch "{\"id\":\"$VERA\",\"uniformStyle\":\"Men's\"}")" '"ok":true'
check "  and her record reads it" "$(styleOf "$VERA")" "^\[Men.s\]$"
check "  while Nell is left as she was" "$(styleOf "$NELL")" "^\[Women.s\]$"
VB=$(ids "$VERA"); NB=$(ids "$NELL")
check "Vera collects her bag at the counter" "$(mut request.collected "{\"id\":\"$VC\"}")" '"status":"collected"'
check "  and the row it wrote is marked the wrong cut, and neither another group's nor an override" "$(sinceS "$VERA" "$VB")" '^WB=True/False/False$'
check "Nell collects hers" "$(mut request.collected "{\"id\":\"$NC\"}")" '"status":"collected"'
check "  and hers is marked none of the three" "$(sinceS "$NELL" "$NB")" '^WB=False/False/False$'
VB=$(ids "$VERA"); NB=$(ids "$NELL")
check "Mara signs for Vera's bag on the round" "$(smut round.sign "$MJ" "{\"id\":\"$VR\"}")" '"ok":true'
check "  and that row is marked the wrong cut as well" "$(sinceS "$VERA" "$VB")" '^WB=True/False/False$'
check "and for Nell's" "$(smut round.sign "$MJ" "{\"id\":\"$NR\"}")" '"ok":true'
check "  and hers is not" "$(sinceS "$NELL" "$NB")" '^WB=False/False/False$'

echo "== every split of an off-style garment keeps the mark"
# What the counter handed over on the override is split by three ordinary acts — a hand-in, a return
# over the counter, and a swap for another size — and each of them writes a new issue row off the old
# one. A split that dropped the mark would take the garment off the Exceptions report for the month
# it was queried, and leave the half still out with the wearer reading as an ordinary issue. Both
# halves of every split are read, the new-size row a swap writes included, beside a garment of Rory's
# own cut put through the very same three splits: a split that stamped every row it wrote would pass
# the blouse and fail the trouser.
#
# Two sizes on each, because a swap needs another size to swap into. A blouse and a trouser because
# they are the two halves of a set and carry a ceiling each, so four of each is four tops and four
# pairs — well inside six of either, and nothing below is an override of the ceiling. Both are for
# every staff group, so the group rule marks nothing here either.
# These two go on the catalogue through the counter's own add rather than the importer, and the
# reason is a ceiling rather than a preference: every import and every restore counts against one
# bucket of twenty per coordinator per ten minutes (app/api/mutate/route.ts). This suite is a single
# coordinator that already spends most of them, so adding a catalogue import and an opening-stock
# import here pushed it to twenty-one — and the call refused was the restore at the very end, which
# is where the marks are read back. The add carries the sizes and the opening stock in the one call,
# so the section still builds its own fixtures and stands alone. That leaves nineteen, one spare:
# anything added here later should come in the same way rather than through the importer.
# No group is sent, and no group means every group, so the group rule marks nothing in this section.
check "a women's-cut blouse, two sizes, with stock on the shelf" "$(mut catalog.add '{"item":"Bistro Blouse","sku":"BB","type":"Blouse","gender":"Female","supplier":"Alpha Supply","cost":31,"sizes":["S","M"],"opening":[{"si":0,"qty":20},{"si":1,"qty":20}]}')" '"id":"'
check "  and a men's-cut trouser beside it" "$(mut catalog.add '{"item":"Bistro Trouser","sku":"BT","type":"Trousers","gender":"Male","supplier":"Alpha Supply","cost":29,"sizes":["S","M"],"opening":[{"si":0,"qty":20},{"si":1,"qty":20}]}')" '"id":"'
BB=$(bk | py 'print([i["id"] for i in d["items"] if i["sku"]=="BB"][0])')
BT=$(bk | py 'print([i["id"] for i in d["items"] if i["sku"]=="BT"][0])')
check "one more in Kitchen, set to Men's and wearing S" "$(mut import.rows "{\"kind\":\"staff\",\"rows\":[{\"num\":\"20\",\"first\":\"Rory\",\"last\":\"Blake\",\"group\":\"Kitchen\",\"dept\":\"Ward 1\",\"top\":\"S\",\"pants\":\"S\",\"style\":\"Men's\"}]}")" '"created":1'
RORY=$(bk | py 'print([s["id"] for s in d["staff"] if s["num"]=="20"][0])')
# Every issue row he has, as SKU:size:qty:state:offStyle:offGroup:override. The size, because a swap
# writes its new row in another one; the state, because these three splits leave rows handed in,
# returned and still out beside each other, and each has to be named for what it is. All three flags
# are read, so a split that carried the mark onto the wrong one fails here rather than reading alike.
srows(){ bk | py "sk={i['id']: i['sku'] for i in d['items']}; sz={i['id']: i['sizes'] for i in d['items']}; st=lambda r: 'in' if r['handedIn'] else (('ret-' + (r['returnedCond'] or '').split(' - ')[-1].lower().replace(' ', '-')) if r['returnedDate'] else 'held'); print(' '.join(sorted('%s:%s:%d:%s:%s:%s:%s' % (sk[r['itemId']], sz[r['itemId']][r['sizeIndex']], r['qty'], st(r), r['offStyle'], r['offGroup'], r['override']) for r in d['issues'] if r['staffId']=='$1')))"; }
R=$(issue "$RORY" "$(L $BB 4 stock),$(L $BT 4 stock)" ',"override":true')
check "Rory takes four women's-cut blouses on the override, and four trousers of his own cut" "$R" '"stock":8'
check "  and the counter is told one garment was not his cut" "$R" '"offStyle":1'
check "  the blouses' row marked the wrong cut, the trousers' not, and neither a group nor an override" "$(srows "$RORY")" '^BB:S:4:held:True:False:False BT:S:4:held:False:False:False$'
check "Rory hands one blouse in, and one trouser beside it" "$(printf '%s\n' "$(handin "$RORY" "$BB")" "$(handin "$RORY" "$BT")" | grep -c '"good":1')" '^2$'
check "  each row split in two, both halves of the blouse marked and neither half of the trouser" "$(srows "$RORY")" '^BB:S:1:in:True:False:False BB:S:3:held:True:False:False BT:S:1:in:False:False:False BT:S:3:held:False:False:False$'
# The one row of that garment still out with him, named rather than picked from a list, so a split
# that left two rows out or marked the wrong half fails here instead of being read past.
out1(){ bk | py "x=[i['id'] for i in d['issues'] if i['staffId']=='$1' and i['itemId']=='$2' and not i['handedIn'] and not i['returnedDate']]; print(x[0] if len(x)==1 else 'expected one row still out, found %d' % len(x))"; }
check "one blouse comes back over the counter damaged, and one trouser with it" "$(printf '%s\n' "$(mut issue.return "{\"id\":\"$(out1 "$RORY" "$BB")\",\"qty\":1,\"cond\":\"Returned - Damaged\"}")" "$(mut issue.return "{\"id\":\"$(out1 "$RORY" "$BT")\",\"qty\":1,\"cond\":\"Returned - Damaged\"}")" | grep -c '"ok":true')" '^2$'
check "  the returned half and the half still out both marked, and the trouser's neither" "$(srows "$RORY")" '^BB:S:1:in:True:False:False BB:S:1:ret-damaged:True:False:False BB:S:2:held:True:False:False BT:S:1:in:False:False:False BT:S:1:ret-damaged:False:False:False BT:S:2:held:False:False:False$'
check "one of the two blouses still out is swapped for the other size" "$(mut issue.exchange "{\"id\":\"$(out1 "$RORY" "$BB")\",\"si\":1,\"qty\":1}")" '"size":"M"'
check "  and one trouser the same way" "$(mut issue.exchange "{\"id\":\"$(out1 "$RORY" "$BT")\",\"si\":1,\"qty\":1}")" '"size":"M"'
check "  the new size, the size it replaced and the one still out all marked, and the trouser's none of them" "$(srows "$RORY")" '^BB:M:1:held:True:False:False BB:S:1:held:True:False:False BB:S:1:in:True:False:False BB:S:1:ret-damaged:True:False:False BB:S:1:ret-good:True:False:False BT:M:1:held:False:False:False BT:S:1:held:False:False:False BT:S:1:in:False:False:False BT:S:1:ret-damaged:False:False:False BT:S:1:ret-good:False:False:False$'

echo "== correcting a phone number doesn't clear the cut somebody was set to"
# The details form saves the whole record and sends no style, because the style has its own control.
# A save that blanked it every time would put people back to "nobody has said" — offered the whole
# catalogue again — with nothing on any screen to say it had happened.
check "Dana's record saved from the details form, with a phone number added" "$(mut staff.save "{\"id\":\"$DANA\",\"num\":\"11\",\"first\":\"Dana\",\"last\":\"Lee\",\"group\":\"Kitchen\",\"dept\":\"Ward 1\",\"top\":\"M\",\"pants\":\"M\",\"phone\":\"0400 000 111\"}")" '"ok":true'
check "  leaves her set to Women's" "$(styleOf "$DANA")" "^\[Women.s\]$"
check "  and the men's shirt is still refused to her" "$(issue "$DANA" "$(L $FS 1 stock)")" "Field Shirt is the Men.s cut"
# Blank is a decision a coordinator can go back to: whoever ticked the wrong one has to be able to
# undo it, and undoing it offers her everything again, which is where this section started.
check "the cut can be cleared back to nobody having said" "$(mut staff.patch "{\"id\":\"$DANA\",\"uniformStyle\":\"\"}")" '"ok":true'
check "  and her record reads blank" "$(styleOf "$DANA")" '^\[\]$'
check "  and the men's shirt is on her request screen again" "$(shop "$DJ")" 'Field Shirt'
check "and she is set back to Women's, for the restore below" "$(mut staff.patch "{\"id\":\"$DANA\",\"uniformStyle\":\"Women's\"}")" '"ok":true'

echo "== a restore keeps a garment's groups and cut, both marks, and every wearer's style"
# Last, because a restore gives every row a fresh id and the staff sessions above are keyed to the
# old ones. Everything is read by staff number and SKU, which survive it. Every issue row is compared,
# both marks and neither alike, so a restore that dropped one and one that stamped it on everything
# both fail — and the tunic, tagged for two groups, has to come back with both.
#
# The register's own column is compared the same way and for the same reason: every record at once,
# so a restore that lost the cut and one that wrote a cut onto the blanks both fail. Blank has to come
# back blank — it is the state nobody has decided, not a value worth guessing at.
GBY(){ bk | py "print(','.join([i['groups'] for i in d['items'] if i['sku']=='$1'][0]))"; }
every(){ bk | py "sk={i['id']: i['sku'] for i in d['items']}; nm={s['id']: s['num'] for s in d['staff']}; print(' '.join(sorted('%s:%s:%d:%s:%s:%s' % (nm[r['staffId']], sk[r['itemId']], r['qty'], 'in' if r['handedIn'] else 'held', r['offGroup'], r['offStyle']) for r in d['issues'])))"; }
# Every staff record's cut, by staff number, in brackets so blank — nobody has said — is a value a
# check can name rather than an empty space between two others.
styles(){ bk | py "print(' '.join(sorted('[%s=%s]' % (s['num'], s['uniformStyle']) for s in d['staff'])))"; }
A0=$(every); S0=$(styles)
check "before: the tunic is for two groups" "$(GBY WT)" '^Registered Nurse,Enrolled Nurse$'
check "  and Gus holds a tunic marked outside his group, and not as the wrong cut" "$A0" '8:WT:1:held:True:False'
check "  beside Rhea's, which is marked neither" "$A0" '7:WT:1:held:False:False'
check "  while Dana holds a men's shirt marked the wrong cut, and not as another group's" "$A0" '11:FS:1:held:False:True'
check "  beside the one she was handed before anybody set her cut" "$A0" '11:FS:1:held:False:False'
check "  and the register carries her cut" "$S0" "\[11=Women.s\]"
check "  Ash's Either, and Robin's blank" "$S0" '\[13=Either\] \[14=\]'
RF="$T/tc-sets-restore.json"
# Written to a file and sent from it: the whole facility's backup is too long to pass as one argument.
printf '{"op":"backup.restore","payload":%s}' "$(bk)" > "$RF"
check "the backup restores" "$(curl -s -b "$J" -X POST "$B/api/mutate" -H 'content-type: application/json' --data-binary @"$RF")" '"ok":true'
A1=$(every); S1=$(styles)
check "after: the tunic is still for both groups" "$(GBY WT)" '^Registered Nurse,Enrolled Nurse$'
check "  and the cap for the renamed one" "$(GBY GC)" '^Protective Services$'
check "  the blouse is still the women's cut and the shirt the men's" "$(bk | py "print(' '.join(sorted(i['sku'] + '=' + i['gender'] for i in d['items'] if i['sku'] in ('WB', 'FS'))))")" '^FS=Male WB=Female$'
check "  Gus's tunic is still marked outside his group" "$A1" '8:WT:1:held:True:False'
check "  and Dana's shirt is still marked the wrong cut" "$A1" '11:FS:1:held:False:True'
if [ -n "$A0" ] && [ "$A1" = "$A0" ]; then ok "  and every issue row carries both marks it had before"; else fail "  and every issue row carries both marks it had before" "$(echo "$A1" | head -c 300)"; fi
if [ -n "$S0" ] && [ "$S1" = "$S0" ]; then ok "  and every staff record the cut it was set to, blanks included"; else fail "  and every staff record the cut it was set to, blanks included" "$(echo "$S1" | head -c 300)"; fi
# Read once more through the rule itself rather than off the record: a restore that brought the word
# back as something normalUniformStyle() doesn't know would read blank here and refuse nothing.
check "and the men's shirt is still refused to Dana after the restore" "$(issue "$(bk | py 'print([s["id"] for s in d["staff"] if s["num"]=="11"][0])')" "$(L "$(bk | py 'print([i["id"] for i in d["items"] if i["sku"]=="FS"][0])')" 1 stock)")" "Field Shirt is the Men.s cut — Dana Lee is set to Women.s"

echo; echo "PASS=$PASS FAIL=$FAIL"; [ "$FAIL" -eq 0 ]
