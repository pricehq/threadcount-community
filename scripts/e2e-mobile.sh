#!/usr/bin/env bash
# Mobile pack: photo store + attachments (approval / receipt / return), delivery rounds (signature + proof), photo route auth, backup round-trip, rounds page.
set -u
B=${BASE:-http://127.0.0.1:3111}
# Refuses early, with the fix, when the server under test is in production mode with
# Turnstile refusing every auth route — otherwise the first signup fails and every check
# after it reports a security-check error instead of what it was testing.
. "$(dirname "$0")/e2e-preflight.sh"; e2e_preflight "$B"
T=${TMP:-/tmp}; J="$T/tc-mob-cj.txt"; rm -f "$J"
PASS=0; FAIL=0
ok()   { PASS=$((PASS+1)); echo "  ✓ $1"; }
fail() { FAIL=$((FAIL+1)); echo "  ✗ $1 :: $2"; }
mut()  { curl -s -b "$J" -c "$J" -X POST "$B/api/mutate" -H 'content-type: application/json' -d "{\"op\":\"$1\",\"payload\":$2}"; }
check(){ local name=$1 out=$2 pat=$3; if echo "$out" | grep -q "$pat"; then ok "$name"; else fail "$name" "$(echo "$out" | head -c 300)"; fi; }
py()   { python3 -c "import sys,json; d=json.load(sys.stdin); $1"; }
bk()   { curl -s -b "$J" "$B/api/backup"; }
PNG='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='
JPG='data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA='

TS=$(date +%s)
check "signup" "$(curl -s -c "$J" -X POST "$B/api/auth/signup" -H 'content-type: application/json' -H "x-forwarded-for: 10.9.$((RANDOM%250)).$((RANDOM%250))" -d "{\"first\":\"Mob\",\"last\":\"Admin\",\"facility\":\"Mobile Hospital $TS\",\"email\":\"mob$TS@example.com\",\"password\":\"password123\"}")" '"ok":true'
check "the facility names its staff groups" "$(e2e_groups "$B" "$J")" '"ok":true'
check "supplier" "$(mut supplier.add '{"name":"Alpha Supply"}')" '"id"'
check "dept" "$(mut dept.save '{"name":"Willow Ward","cc":"RGH-3010"}')" '"ok":true'
check "catalog" "$(mut import.rows '{"kind":"catalog","rows":[{"item":"RN Scrub Top","sku":"T1","supplier":"Alpha Supply","cost":"30","group":"Registered Nurse","sizes":"S|M"}]}')" '"created":1'
check "opening accepted" "$(mut import.rows '{"kind":"opening","rows":[{"sku":"T1","size":"M","opening":"5"}]}')" '"created":1'
# The response only counts rows walked — it still says {"created":1} when the quantity parsed as 0
# and nothing reached the shelf. Everything below issues from this stock, so check the shelf itself.
check "opening 5 on the shelf" "$(bk | py 'print(([s["opening"] for s in d["stock"] if s["sizeIndex"]==1] or [0])[0])')" '^5$'
check "staff" "$(mut import.rows '{"kind":"staff","rows":[{"num":"1","first":"Nina","last":"Nurse","phone":"0400 111 222","group":"Registered Nurse","dept":"Willow Ward","top":"M","pants":"M"}]}')" '"created":1'
BK=$(bk); T1=$(echo "$BK" | py 'print(d["items"][0]["id"])'); NINA=$(echo "$BK" | py 'print(d["staff"][0]["id"])')

echo "== photo store"
check "bad photo rejected" "$(mut photo.put '{"kind":"approval","data":"data:text/html;base64,PGI+"}')" 'JPEG or PNG'
check "svg rejected" "$(mut photo.put '{"kind":"approval","data":"data:image/svg+xml;base64,PHN2Zz4="}')" 'JPEG or PNG'
R=$(mut photo.put "{\"kind\":\"approval\",\"data\":\"$JPG\"}"); check "jpeg stored" "$R" '"id"'; PH1=$(echo "$R" | py 'print(d["result"]["id"])')
R=$(mut photo.put "{\"kind\":\"sig\",\"data\":\"$PNG\"}"); check "png stored" "$R" '"id"'; PH2=$(echo "$R" | py 'print(d["result"]["id"])')
check "photo route serves jpeg" "$(curl -s -b "$J" -o /dev/null -w '%{http_code} %{content_type}' "$B/api/photo/$PH1")" '200 image/jpeg'
check "photo route serves png" "$(curl -s -b "$J" -o /dev/null -w '%{http_code} %{content_type}' "$B/api/photo/$PH2")" '200 image/png'
check "photo route needs auth" "$(curl -s -o /dev/null -w '%{http_code}' "$B/api/photo/$PH1")" '401'

echo "== attachments"
R=$(mut approval.add "{\"staffId\":\"$NINA\",\"by\":\"J Manager\",\"sets\":\"2\",\"photoId\":\"$PH1\"}"); check "approval with form photo" "$R" '"id"'
check "approval photoId in backup" "$(bk | py 'print(d["approvals"][0]["photoId"]=="'$PH1'")')" 'True'
# A real photo belonging to another facility, not an invented id: an id that exists nowhere is
# still refused by an ownPhoto with the facility filter torn out, so only a genuine cross-facility
# id can show that the ownership rule is still there.
J2="$T/tc-mob-cj2.txt"; rm -f "$J2"
check "second facility signup" "$(curl -s -c "$J2" -X POST "$B/api/auth/signup" -H 'content-type: application/json' -H "x-forwarded-for: 10.9.$((RANDOM%250)).$((RANDOM%250))" -d "{\"first\":\"Other\",\"last\":\"Admin\",\"facility\":\"Other Hospital $TS\",\"email\":\"oth$TS@example.com\",\"password\":\"password123\"}")" '"ok":true'
R=$(curl -s -b "$J2" -c "$J2" -X POST "$B/api/mutate" -H 'content-type: application/json' -d "{\"op\":\"photo.put\",\"payload\":{\"kind\":\"approval\",\"data\":\"$JPG\"}}"); check "second facility photo stored" "$R" '"id"'; OTHER_PH=$(echo "$R" | py 'print(d["result"]["id"])')
check "approval with foreign photo rejected" "$(mut approval.add "{\"staffId\":\"$NINA\",\"by\":\"J Manager\",\"sets\":\"1\",\"photoId\":\"$OTHER_PH\"}")" 'Photo not found'
check "approval with unknown photo rejected" "$(mut approval.add "{\"staffId\":\"$NINA\",\"by\":\"J Manager\",\"sets\":\"1\",\"photoId\":\"nope123\"}")" 'Photo not found'
check "issue order-in" "$(mut issue.create "{\"staffId\":\"$NINA\",\"apDeduct\":0,\"lines\":[{\"itemId\":\"$T1\",\"si\":1,\"qty\":1,\"src\":\"order\"}]}")" '"ordered":1'
ORD=$(bk | py 'print([o["id"] for o in d["orders"] if o["orderFor"]=="Staff Member"][0])'); LID=$(bk | py 'print([o for o in d["orders"] if o["orderFor"]=="Staff Member"][0]["lines"][0]["id"])')
R=$(mut photo.put "{\"kind\":\"receipt\",\"data\":\"$JPG\"}"); PH3=$(echo "$R" | py 'print(d["result"]["id"])')
R=$(mut order.receive "{\"id\":\"$ORD\",\"invoice\":\"INV-1\",\"photoId\":\"$PH3\",\"lines\":[{\"lineId\":\"$LID\",\"arrived\":1,\"dest\":\"pickup\"}]}"); check "receive with invoice photo accepted" "$R" '"ok":true'
# "ok":true is the envelope every op that doesn't throw returns, so it says nothing about where the
# garments went. Only a pending pickup row proves the delivery was routed to the wearer instead of
# quietly landing on the shelf — which is what the whole rounds section below then relies on.
check "receive with invoice photo → pickup" "$(bk | py 'print(len([p for p in d["pickups"] if p["orderId"]=="'$ORD'" and not p["pickedUp"]]))')" '^1$'
check "receipt photoId stored" "$(bk | py 'print([o for o in d["orders"] if o["id"]=="'$ORD'"][0]["receipts"][0]["photoId"]=="'$PH3'")')" 'True'
check "issue from stock" "$(mut issue.create "{\"staffId\":\"$NINA\",\"apDeduct\":0,\"lines\":[{\"itemId\":\"$T1\",\"si\":1,\"qty\":1,\"src\":\"stock\"}]}")" '"stock":1'
ISS=$(bk | py 'print([i["id"] for i in d["issues"] if not i["direct"]][0])')
R=$(mut photo.put "{\"kind\":\"return\",\"data\":\"$JPG\"}"); PH4=$(echo "$R" | py 'print(d["result"]["id"])')
check "return with damage photo" "$(mut issue.return "{\"id\":\"$ISS\",\"cond\":\"Returned - Damaged\",\"photoId\":\"$PH4\"}")" '"ok":true'
check "return photoId stored" "$(bk | py 'print([i for i in d["issues"] if i["id"]=="'$ISS'"][0]["returnPhotoId"]=="'$PH4'")')" 'True'

echo "== delivery rounds"
PU=$(bk | py 'print([p["id"] for p in d["pickups"] if not p["pickedUp"]][0])')
# The ward name sits in every /app page's HTML whether this list renders or not — the layout
# serialises the whole snapshot into the flight payload — so match the per-row button, which only
# a rendered pending delivery emits.
check "rounds page renders ward row" "$(curl -s -b "$J" "$B/app/rounds")" 'Sign for the delivery to Nina Nurse'
check "rounds page tel link" "$(curl -s -b "$J" "$B/app/rounds")" 'tel:0400111222'
check "dashboard tel link" "$(curl -s -b "$J" "$B/app")" 'tel:0400111222'
R=$(mut photo.put "{\"kind\":\"proof\",\"data\":\"$JPG\"}"); PH5=$(echo "$R" | py 'print(d["result"]["id"])')
check "deliver with signature + proof" "$(mut pickup.deliver "{\"id\":\"$PU\",\"deliveredTo\":\"J. Barnes, Ward Manager\",\"sigId\":\"$PH2\",\"proofId\":\"$PH5\"}")" '"ok":true'
check "pickup marked delivered round" "$(bk | py 'p=[p for p in d["pickups"] if p["id"]=="'$PU'"][0]; print(p["deliveredRound"], p["deliveredTo"], p["sigId"]=="'$PH2'", p["proofId"]=="'$PH5'", bool(p["pickedUp"]))')" 'True J. Barnes, Ward Manager True True True'
check "direct issue created + receipt signed" "$(bk | py 'i=[i for i in d["issues"] if i["direct"]][0]; print(i["receipt"], i["orderCode"]!="")')" 'True True'
check "deliver twice refused" "$(mut pickup.deliver "{\"id\":\"$PU\",\"deliveredTo\":\"x\"}")" 'Already handed over'
check "rounds page now empty" "$(curl -s -b "$J" "$B/app/rounds")" 'Nothing waiting for delivery'

echo "== backup round-trip keeps photos"
BKF=$(bk)
# A row count alone passes on a backup full of empty strings, which is exactly what the move to
# disk storage broke: a photo whose file can't be read is exported as data:"" and still counted.
check "backup has photos" "$(echo "$BKF" | py 'print(len(d["photos"]), sum(1 for p in d["photos"] if str(p.get("data") or "").startswith("data:image/")))')" '^5 5$'
check "restore" "$(curl -s -b "$J" -X POST "$B/api/mutate" -H 'content-type: application/json' -d "{\"op\":\"backup.restore\",\"payload\":$BKF}")" '"ok":true\|restored'
check "photos restored" "$(bk | py 'print(len(d["photos"]))')" '^5$'
NEWAP=$(bk | py 'print(d["approvals"][0]["photoId"] or "")'); check "approval photo remapped + served" "$(curl -s -b "$J" -o /dev/null -w '%{http_code}' "$B/api/photo/$NEWAP")" '200'
check "pickup sig/proof remapped" "$(bk | py 'p=d["pickups"][0]; print(bool(p["sigId"]) and bool(p["proofId"]) and p["deliveredTo"])')" 'J. Barnes, Ward Manager'

echo; echo "PASS=$PASS FAIL=$FAIL"; [ "$FAIL" -eq 0 ]
