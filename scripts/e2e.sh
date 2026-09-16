#!/usr/bin/env bash
# ThreadCount update-wave smoke test against a local dev server. Exercises every new op end-to-end.
set -u
B=${BASE:-http://127.0.0.1:3111}
# Refuses early, with the fix, when the server under test is in production mode with
# Turnstile refusing every auth route — otherwise the first signup fails and every check
# after it reports a security-check error instead of what it was testing.
. "$(dirname "$0")/e2e-preflight.sh"; e2e_preflight "$B"
J=${TMP:-/tmp}/tc-cj.txt; rm -f "$J"
PASS=0; FAIL=0
ok()   { PASS=$((PASS+1)); echo "  ✓ $1"; }
fail() { FAIL=$((FAIL+1)); echo "  ✗ $1 :: $2"; }
mut()  { curl -s -b "$J" -c "$J" -X POST "$B/api/mutate" -H 'content-type: application/json' -d "{\"op\":\"$1\",\"payload\":$2}"; }
check(){ local name=$1 out=$2 pat=$3; if echo "$out" | grep -q "$pat"; then ok "$name"; else fail "$name" "$out"; fi; }
jget() { python3 -c "import sys,json; d=json.load(sys.stdin); print(eval('d$1'))"; }

TS=$(date +%s); EMAIL="e2e$TS@example.com"
echo "== signup"
R=$(curl -s -c "$J" -X POST "$B/api/auth/signup" -H 'content-type: application/json' -H "x-forwarded-for: 10.9.$((RANDOM%250)).$((RANDOM%250))" -d "{\"first\":\"Test\",\"last\":\"Admin\",\"facility\":\"E2E Hospital $TS\",\"email\":\"$EMAIL\",\"password\":\"password123\"}")
check "signup" "$R" '"ok":true'
check "the facility names its staff groups" "$(e2e_groups "$B" "$J")" '"ok":true'

echo "== setup: depts, suppliers, catalog, staff, opening"
check "dept A" "$(mut dept.save '{"name":"Willow Ward","cc":"RGH-3010"}')" '"ok":true'
check "dept B" "$(mut dept.save '{"name":"Security","cc":"RGH-5090"}')" '"ok":true'
check "dept dup rejected" "$(mut dept.save '{"name":"willow ward","cc":"1"}')" 'already'
R=$(mut supplier.add '{"name":"Northline Workwear"}'); check "supplier add" "$R" '"id"'; SUP=$(echo "$R" | jget '["result"]["id"]')
check "supplier update lead" "$(mut supplier.update "{\"id\":\"$SUP\",\"lead\":\"10\",\"contact\":\"Dana\",\"account\":\"ACC-1\"}")" '"ok":true'
check "supplier dup rejected" "$(mut supplier.add '{"name":"northline workwear"}')" 'already'
# Scrub Pant is for every group. Sam, in Security, has a pair ordered in further down to prove an
# order-in takes the product's own supplier; tagged for nurses only, it would be refused at the counter
# as outside his staff group before that was ever looked at.
R=$(mut import.rows '{"kind":"catalog","rows":[{"item":"RN Scrub Top","gender":"Unisex","sku":"TOP1","supplier":"Northline Workwear","cost":"30","group":"Registered Nurse","sizes":"S|M|L"},{"item":"Scrub Pant","gender":"Unisex","sku":"PANT1","supplier":"Harbour Embroidery","cost":"25","group":"All","sizes":"S|M|L"},{"item":"Security Shirt","gender":"Male","sku":"SEC1","supplier":"Northline Workwear","cost":"40","group":"Security","sizes":"M|L"}]}')
check "catalog import 3" "$R" '"created":3'
check "supplier auto-created from import" "$(mut supplier.add '{"name":"Harbour Embroidery"}')" 'already'
R=$(mut import.rows '{"kind":"staff","rows":[{"num":"1001","first":"Nina","last":"Nurse","group":"Registered Nurse","dept":"Willow Ward","top":"M","pants":"M"},{"num":"2002","first":"Sam","last":"Guard","group":"Security","dept":"Security","ent":"2","top":"L","pants":"L"}]}')
check "staff import 2" "$R" '"created":2'
check "opening import" "$(mut import.rows '{"kind":"opening","rows":[{"sku":"TOP1","size":"M","opening":"10","reorder":"3"},{"sku":"PANT1","size":"M","opening":"10"},{"sku":"SEC1","size":"L","opening":"1","reorder":"2"},{"sku":"TOP1","size":"S","opening":"0","reorder":"2"}]}')" '"created":4'
# Footwear is not issued in this linen room, so a shoe column on the staff template would have wards
# filling in sizes for something nobody can ever hand them. Read the template's own header row out of
# csv.ts and look at the columns themselves: pinning one long literal header string, as this used to,
# stopped matching anything the day a manager column was added between cc and top, and from then on
# the check passed whatever the file said.
STAFF_HDR=$(sed -n 's/^[[:space:]]*staff:.*headers: "\([^"]*\)".*$/\1/p' "$(dirname "$0")/../lib/csv.ts")
check "staff CSV template header row found" "$STAFF_HDR" '^num,'
check "staff CSV template has no shoe column" "$(echo ",$STAFF_HDR," | grep -c ',[^,]*[Ss]hoe[^,]*,' || true)" '^0$'

echo "== fetch ids via backup"
BK=$(curl -s -b "$J" "$B/api/backup")
check "backup v2" "$BK" 'threadcount-backup-v2'
NINA=$(echo "$BK" | python3 -c "import sys,json; d=json.load(sys.stdin); print([s['id'] for s in d['staff'] if s['num']=='1001'][0])")
SAM=$(echo "$BK"  | python3 -c "import sys,json; d=json.load(sys.stdin); print([s['id'] for s in d['staff'] if s['num']=='2002'][0])")
TOP=$(echo "$BK"  | python3 -c "import sys,json; d=json.load(sys.stdin); print([i['id'] for i in d['items'] if i['sku']=='TOP1'][0])")
PANT=$(echo "$BK" | python3 -c "import sys,json; d=json.load(sys.stdin); print([i['id'] for i in d['items'] if i['sku']=='PANT1'][0])")
SEC=$(echo "$BK"  | python3 -c "import sys,json; d=json.load(sys.stdin); print([i['id'] for i in d['items'] if i['sku']=='SEC1'][0])")
check "lastBackup stamped" "$(curl -s -b "$J" "$B/api/backup" | python3 -c "import sys,json; print(json.load(sys.stdin)['facility']['lastBackup'])")" '^20'

echo "== manager approvals + nursing issue"
R=$(mut approval.add "{\"staffId\":\"$NINA\",\"by\":\"J. Barnes, Ward 3A\",\"sets\":\"3\",\"fte\":\"1.0\"}"); check "approval add" "$R" '"id"'; AP=$(echo "$R" | jget '["result"]["id"]')
check "approval needs by" "$(mut approval.add "{\"staffId\":\"$NINA\",\"by\":\"\",\"sets\":\"3\"}")" 'required'
R=$(mut issue.create "{\"staffId\":\"$NINA\",\"apDeduct\":2,\"lines\":[{\"itemId\":\"$TOP\",\"si\":1,\"qty\":2,\"src\":\"stock\"},{\"itemId\":\"$PANT\",\"si\":1,\"qty\":2,\"src\":\"stock\"}]}")
check "nursing issue (no limit, 4 items)" "$R" '"stock":4'
check "approval deducted 2, 1 remaining" "$R" '"apDeducted":2,"apRemaining":1'
check "second approval" "$(mut approval.add "{\"staffId\":\"$NINA\",\"by\":\"K. Lee\",\"sets\":\"2\"}")" '"id"'
# Ask for fewer sets than are open — 1 left on Barnes, 2 on Lee — so the split shows. Draining both
# in one go proves nothing about order; taking 1+1 does, and both approvals were raised the same day,
# so the only thing deciding which one moves first is the order they were entered in.
R=$(mut issue.create "{\"staffId\":\"$NINA\",\"apDeduct\":2,\"lines\":[{\"itemId\":\"$TOP\",\"si\":1,\"qty\":1,\"src\":\"stock\"}]}")
check "deduct of 2 rolls across approvals (1+1)" "$R" '"apDeducted":2,"apRemaining":1'
check "oldest approval drained first" "$(curl -s -b "$J" "$B/api/backup" | python3 -c "import sys,json; d=json.load(sys.stdin); print(' '.join(a['byName']+'='+str(a['used']) for a in sorted(d['approvals'], key=lambda a: a['byName'])))")" '^J\. Barnes, Ward 3A=3 K\. Lee=1$'
# Asking for more sets than the manager has signed for takes what is open and stops there.
R=$(mut issue.create "{\"staffId\":\"$NINA\",\"apDeduct\":5,\"lines\":[{\"itemId\":\"$TOP\",\"si\":1,\"qty\":1,\"src\":\"stock\"}]}")
check "deduct clamped to the 1 set still open" "$R" '"apDeducted":1,"apRemaining":0'
R=$(mut issue.create "{\"staffId\":\"$NINA\",\"apDeduct\":1,\"lines\":[{\"itemId\":\"$TOP\",\"si\":1,\"qty\":1,\"src\":\"stock\"}]}")
check "no open approval -> 0 deducted" "$R" '"apDeducted":0'

echo "== the six-set ceiling + order-in supplier from product"
# Seven shirts ordered in for somebody holding nothing is one past the six tops anyone may hold.
# Sam's own figure of 2 on the register is a yearly reporting number now, so it is the ceiling that
# has to refuse this — and refusing it leaves no order behind to move the reorder figures below.
R=$(mut issue.create "{\"staffId\":\"$SAM\",\"lines\":[{\"itemId\":\"$SEC\",\"si\":0,\"qty\":7,\"src\":\"order\"}]}")
check "server refuses a seventh top without an override (six sets held is the ceiling)" "$R" 'the most anyone holds is 6 sets'
# One Security Shirt L on the shelf and two cart lines asking for one each: either line would pass on
# its own, so only a check that adds the lines up first refuses this. Asking 2+2, as this used to, is
# refused just as fast by a naive per-line check, which left the rule the label names untested.
R=$(mut issue.create "{\"staffId\":\"$SAM\",\"lines\":[{\"itemId\":\"$SEC\",\"si\":1,\"qty\":1,\"src\":\"stock\"},{\"itemId\":\"$SEC\",\"si\":1,\"qty\":1,\"src\":\"stock\"}]}")
check "cumulative shelf check (1 on hand, 1+1 asked)" "$R" 'Not enough on the shelf'
R=$(mut issue.create "{\"staffId\":\"$SAM\",\"lines\":[{\"itemId\":\"$SEC\",\"si\":1,\"qty\":1,\"src\":\"stock\"},{\"itemId\":\"$PANT\",\"si\":0,\"qty\":1,\"src\":\"order\",\"supplier\":\"WRONG\"}]}")
check "issue stock + order-in" "$R" '"stock":1,"ordered":1'
check "order-in cc uses staff dept (no override)" "$(curl -s -b "$J" "$B/api/backup" | python3 -c "import sys,json; d=json.load(sys.stdin); print([o['cc'] for o in d['orders'] if o['orderFor']=='Staff Member'][0])")" 'Security'
BK=$(curl -s -b "$J" "$B/api/backup")
check "order-in used product supplier (Harbour), not client value" "$(echo "$BK" | python3 -c "import sys,json; d=json.load(sys.stdin); print([o['supplier'] for o in d['orders'] if o['orderFor']=='Staff Member'])")" 'Harbour'
check "replenish drafts per supplier" "$(echo "$BK" | python3 -c "import sys,json; d=json.load(sys.stdin); print(sorted(o['supplier'] for o in d['orders'] if o['replenish']))")" "Harbour Embroidery', 'Northline Workwear"

echo "== order flagged (2x reorder, net of on-order) + duplicate"
R=$(mut stock.orderFlagged '{}'); check "order flagged added lines" "$R" '"added":[1-9]'
# "added" is the count of need lines the merge looked at, not the count it changed, so it reads the
# same on the second run whether the merge tops a line up or piles onto it. The draft's own line count
# and total are the only things that tell those two apart.
qn(){ curl -s -b "$J" "$B/api/backup" | python3 -c "import sys,json; d=json.load(sys.stdin); o=[o for o in d['orders'] if o['replenish'] and o['supplier']=='Northline Workwear'][0]; print(len(o['lines']), sum(l['qty'] for l in o['lines']))"; }
Q1=$(qn)
check "the draft the merge writes into can be read" "$Q1" '^[0-9][0-9]* [0-9][0-9]*$'
mut stock.orderFlagged '{}' >/dev/null
check "order flagged idempotent (max merge)" "$(qn)" "^$Q1\$"
BK=$(curl -s -b "$J" "$B/api/backup")
ORD=$(echo "$BK" | python3 -c "import sys,json; d=json.load(sys.stdin); print([o['id'] for o in d['orders'] if o['replenish'] and o['supplier']=='Northline Workwear'][0])")
SECQ=$(echo "$BK" | python3 -c "import sys,json; d=json.load(sys.stdin); o=[o for o in d['orders'] if o['replenish'] and o['supplier']=='Northline Workwear'][0]; print([l['qty'] for l in o['lines'] if l['itemId']=='$SEC' and l['size']=='L'][0])")
check "SEC L topped to 2x reorder (draft line itself not netted: 4-0=4)" "$SECQ" '^4$'
R=$(mut order.duplicate "{\"id\":\"$ORD\"}"); check "duplicate order" "$R" '"code":"ORD-'
DUP=$(echo "$R" | jget '["result"]["id"]')
check "receive on a draft rejected" "$(mut order.receive "{\"id\":\"$DUP\",\"lines\":[]}")" 'Mark the order as ordered'
check "dup is Draft with notes" "$(curl -s -b "$J" "$B/api/backup" | python3 -c "import sys,json; d=json.load(sys.stdin); o=[o for o in d['orders'] if o['id']=='$DUP'][0]; print(o['status'], o['notes'])")" 'Draft Duplicated'

echo "== staff patch / alterations / catalog addSize / discontinue"
check "staff deactivate" "$(mut staff.patch "{\"id\":\"$SAM\",\"inactive\":true}")" '"ok":true'
# ok:true only says a row was written. The flag is there to stop the next issue at the counter, so ask
# for one — without this, dropping the write to `inactive` leaves the section green.
check "an inactive staff member can't be issued to" "$(mut issue.create "{\"staffId\":\"$SAM\",\"lines\":[{\"itemId\":\"$SEC\",\"si\":1,\"qty\":1,\"src\":\"stock\"}]}")" 'inactive'
check "staff cc override" "$(mut staff.patch "{\"id\":\"$NINA\",\"ccOverride\":\"RGH-5090\"}")" '"ok":true'
check "cc override recorded on the staff row" "$(curl -s -b "$J" "$B/api/backup" | python3 -c "import sys,json; d=json.load(sys.stdin); print([s['ccOverride'] for s in d['staff'] if s['num']=='1001'][0])")" '^RGH-5090$'
check "staff num immutable" "$(mut staff.save "{\"id\":\"$NINA\",\"num\":\"9999\",\"first\":\"Nina\",\"last\":\"Nurse\"}")" "can't be changed"
R=$(mut alteration.add "{\"staffId\":\"$NINA\",\"garment\":\"Scrub pants (M)\",\"desc\":\"hem 4cm\"}"); check "alteration add" "$R" '"id"'; ALT=$(echo "$R" | jget '["result"]["id"]')
check "alteration advance" "$(mut alteration.advance "{\"id\":\"$ALT\"}")" '"ok":true'
check "alteration at tailor" "$(curl -s -b "$J" "$B/api/backup" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['alterations'][0]['status'])")" 'At tailor'
check "add size" "$(mut catalog.update "{\"id\":\"$TOP\",\"addSize\":\"XL\"}")" '"ok":true'
check "dup size rejected" "$(mut catalog.update "{\"id\":\"$TOP\",\"addSize\":\"XL\"}")" 'already'
check "discontinue" "$(mut catalog.update "{\"id\":\"$SEC\",\"archived\":true}")" '"ok":true'
check "delete item with history blocked" "$(mut catalog.delete "{\"id\":\"$SEC\"}")" 'Discontinue'

echo "== settings + logo"
check "settings finance" "$(mut settings.update '{"glAccount":"631020","journalDesc":"Uniform issues","exceptionHigh":"3"}')" '"ok":true'
check "logo reject non-image" "$(mut settings.update '{"logoData":"data:text/html;base64,PGI+"}')" 'must be'
check "logo rejects svg" "$(mut settings.update '{"logoData":"data:image/svg+xml;base64,PHN2Zz48L3N2Zz4="}')" 'must be'
check "logo accept png" "$(mut settings.update '{"logoData":"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="}')" '"ok":true'
check "logo route serves png" "$(curl -s -b "$J" -o /dev/null -w '%{content_type}' "$B/api/logo")" 'image/png'
check "supplier remove blocked (in use)" "$(mut supplier.remove "{\"id\":\"$SUP\"}")" "can't be removed"

echo "== stocktake"
R=$(mut stocktake.apply "{\"lines\":[{\"itemId\":\"$TOP\",\"si\":1,\"counted\":3},{\"itemId\":\"$PANT\",\"si\":1,\"counted\":8}]}")
check "stocktake apply: 2 counted, 1 variance filed" "$R" '"counted":2,"variances":1'
# The tally above is paperwork. Ten RN tops came in and five have been issued, so the shelf believes 5
# and the counter found 3 — unless the count writes that gap onto the level, the same two garments go
# missing again next month. -2 is the adjustment the count wrote, not the number counted.
check "stocktake moved the shelf (5 on hand, counted 3)" "$(curl -s -b "$J" "$B/api/backup" | python3 -c "import sys,json; d=json.load(sys.stdin); print([s['adj'] for s in d['stock'] if s['itemId']=='$TOP' and s['sizeIndex']==1][0])")" '^-2$'
R=$(mut stocktake.apply "{\"lines\":[{\"itemId\":\"$PANT\",\"si\":1,\"counted\":8}]}")
check "clean count can be filed (0 variances)" "$R" '"counted":1,"variances":0'

echo "== pages render (200)"
for p in /app /app/counter /app/stock "/app/stock?tab=count" "/app/stock/$TOP" /app/orders "/app/orders/$ORD" /app/report /app/staff "/app/staff/$NINA" /app/settings "/print?type=collection&staffName=Nina"; do
  C=$(curl -s -b "$J" -o /dev/null -w '%{http_code}' "$B$p"); [ "$C" = "200" ] && ok "GET $p" || fail "GET $p" "$C"
done
# The portal overhaul folded Issue Stock into the Counter and the stock take into Stock's Count tab.
# Old bookmarks and badge scans must still land there, with their query string kept.
for pair in "/app/issue?staff=x|/app/counter?staff=x" "/app/stocktake|/app/stock?tab=count"; do
  FROM=${pair%%|*}; TO=${pair#*|}
  R=$(curl -s -b "$J" -o /dev/null -w '%{http_code} %{redirect_url}' "$B$FROM")
  case "$R" in 30[78]\ *"$TO") ok "GET $FROM redirects to $TO" ;; *) fail "GET $FROM redirects to $TO" "$R" ;; esac
done
check "slip prints logo img" "$(curl -s -b "$J" "$B/print?type=collection")" 'data:image/png'

echo "== cost at issue, lead time, back-order parent, admin gates"
BK=$(curl -s -b "$J" "$B/api/backup")
check "issues carry cost at issue (30.0 for TOP)" "$(echo "$BK" | python3 -c "import sys,json; d=json.load(sys.stdin); print(sorted(set(i['cost'] for i in d['issues'] if i['itemId']=='$TOP')))")" '\[30'
check "replenish draft expected = today+10 (Northline lead 10)" "$(echo "$BK" | python3 -c "import sys,json,datetime; d=json.load(sys.stdin); o=[o for o in d['orders'] if o['replenish'] and o['supplier']=='Northline Workwear'][0]; print((datetime.date.fromisoformat(o['expected'])-datetime.date.fromisoformat(o['date'])).days)")" '^10$'
# The other branch, read off the order it belongs to: Harbour was created by the catalogue import and
# nobody has given it a lead time, so the order-in raised for a staff member falls back to a fortnight.
check "order-in expected = today+14 (Harbour has no lead)" "$(echo "$BK" | python3 -c "import sys,json,datetime; d=json.load(sys.stdin); o=[o for o in d['orders'] if o['orderFor']=='Staff Member'][0]; print((datetime.date.fromisoformat(o['expected'])-datetime.date.fromisoformat(o['date'])).days)")" '^14$'
check "mark dup ordered" "$(mut order.status "{\"id\":\"$DUP\",\"status\":\"Ordered\"}")" '"ok":true'
LINE=$(echo "$BK" | python3 -c "import sys,json; d=json.load(sys.stdin); o=[o for o in d['orders'] if o['id']=='$DUP'][0]; l=o['lines'][0]; print(l['id'], l['qty'])")
LID=${LINE% *}; LQ=${LINE#* }
R=$(mut order.receive "{\"id\":\"$DUP\",\"lines\":[{\"lineId\":\"$LID\",\"arrived\":1,\"dest\":\"shelf\"}]}")
check "short receive ok" "$R" '"ok":true'
check "back order links to parent via parentId" "$(curl -s -b "$J" "$B/api/backup" | python3 -c "import sys,json; d=json.load(sys.stdin); print([o['parentId']=='$DUP' for o in d['orders'] if o['status']=='Back Order'])")" 'True'
check "second receive rejected" "$(mut order.receive "{\"id\":\"$DUP\",\"lines\":[{\"lineId\":\"$LID\",\"arrived\":1}]}")" 'receiv'
R=$(mut users.add "{\"email\":\"issuer$TS@example.com\",\"password\":\"password123\",\"first\":\"Iss\",\"last\":\"Uer\",\"role\":\"ISSUER\"}"); check "add issuer" "$R" '"id"'
J2=${TMP:-/tmp}/tc-cj2.txt; rm -f "$J2"
curl -s -c "$J2" -X POST "$B/api/auth/login" -H 'content-type: application/json' -d "{\"email\":\"issuer$TS@example.com\",\"password\":\"password123\"}" >/dev/null
check "issuer cannot set reorder" "$(curl -s -b "$J2" -X POST "$B/api/mutate" -H 'content-type: application/json' -d "{\"op\":\"stock.reorder\",\"payload\":{\"itemId\":\"$TOP\",\"si\":0,\"reorder\":9}}")" 'Admin only'
check "issuer cannot bind barcode" "$(curl -s -b "$J2" -X POST "$B/api/mutate" -H 'content-type: application/json' -d "{\"op\":\"barcode.bind\",\"payload\":{\"code\":\"123\",\"itemId\":\"$TOP\",\"si\":0}}")" 'Admin only'
check "issuer can still issue" "$(curl -s -b "$J2" -X POST "$B/api/mutate" -H 'content-type: application/json' -d "{\"op\":\"issue.create\",\"payload\":{\"staffId\":\"$NINA\",\"lines\":[{\"itemId\":\"$TOP\",\"si\":1,\"qty\":1,\"src\":\"stock\"}]}}")" '"stock":1'

echo "== backup restore round-trip"
BK=$(curl -s -b "$J" "$B/api/backup")
R=$(curl -s -b "$J" -X POST "$B/api/mutate" -H 'content-type: application/json' -d "{\"op\":\"backup.restore\",\"payload\":$BK}")
check "restore ok" "$R" '"ok":true'
BK2=$(curl -s -b "$J" "$B/api/backup")
# Both approvals are fully spent by now. A row count still passes if the restore drops `used`, and a
# facility restored that way hands the wearer five manager-approved sets they have already been given —
# so read the balances back, not the tally.
check "restore kept suppliers/approvals/alterations" "$(echo "$BK2" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d['suppliers']), sorted((a['sets'], a['used']) for a in d['approvals']), len(d['alterations']), [s['lead'] for s in d['suppliers'] if s['name']=='Northline Workwear'][0])")" '^2 \[(2, 2), (3, 3)\] 1 10$'

echo "== the revision the screens watch"
# Every open screen polls /api/rev and reloads only when the number moves, so two things have to
# hold: a mutation must move it, and the mutation must hand back the number it produced — without
# that, the screen that made the change refreshes itself a second time when it next polls.
REV1=$(curl -s -b "$J" "$B/api/rev" | jget '["rev"]')
check "a signed-in coordinator can read it" "$REV1" '^[0-9][0-9]*$'
R=$(mut dept.save '{"name":"Rev Ward","cc":"RGH-3030"}')
check "a mutation hands back the new revision" "$R" '"rev":[0-9]'
REV2=$(curl -s -b "$J" "$B/api/rev" | jget '["rev"]')
check "and the number it hands back is the one on the facility" "$(echo "$R" | jget '["rev"]')" "^$REV2\$"
check "which has moved" "$(python3 -c "print('up' if $REV2 > $REV1 else 'stuck')")" '^up$'
# A read is not a change: polling must not make the poll look busy.
curl -s -b "$J" "$B/api/backup" > /dev/null
check "reading changes nothing" "$(curl -s -b "$J" "$B/api/rev" | jget '["rev"]')" "^$REV2\$"
check "and nobody signed in gets a number at all" "$(curl -s "$B/api/rev")" 'Not signed in'

echo "== wipe"
check "wipe" "$(mut data.wipeActivity '{"confirm":"WIPE"}')" '"ok":true'
check "wipe cleared approvals" "$(curl -s -b "$J" "$B/api/backup" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d['approvals']), len(d['issues']))")" '^0 0$'

echo; echo "PASS=$PASS FAIL=$FAIL"
[ $FAIL -eq 0 ]
