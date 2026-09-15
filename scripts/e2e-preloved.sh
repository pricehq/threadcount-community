#!/usr/bin/env bash
# Pre-loved uniforms (Update.V3): pool adjust, hand-ins (good/rag, credit), pre-loved issues (free, no ledger/entitlement/replenish), pool stocktake, backup round-trip.
set -u
B=${BASE:-http://127.0.0.1:3111}
# Refuses early, with the fix, when the server under test is in production mode with
# Turnstile refusing every auth route — otherwise the first signup fails and every check
# after it reports a security-check error instead of what it was testing.
. "$(dirname "$0")/e2e-preflight.sh"; e2e_preflight "$B"
T=${TMP:-/tmp}; J="$T/tc-pl-cj.txt"; rm -f "$J"
PASS=0; FAIL=0
ok()   { PASS=$((PASS+1)); echo "  ✓ $1"; }
fail() { FAIL=$((FAIL+1)); echo "  ✗ $1 :: $2"; }
mut()  { curl -s -b "$J" -c "$J" -X POST "$B/api/mutate" -H 'content-type: application/json' -d "{\"op\":\"$1\",\"payload\":$2}"; }
check(){ local name=$1 out=$2 pat=$3; if echo "$out" | grep -q "$pat"; then ok "$name"; else fail "$name" "$(echo "$out" | head -c 300)"; fi; }
py()   { python3 -c "import sys,json; d=json.load(sys.stdin); $1"; }
bk()   { curl -s -b "$J" "$B/api/backup"; }
pool() { bk | py 'print(next((s["preloved"] for s in d["stock"] if s["itemId"]=="'$1'" and s["sizeIndex"]=='$2'),0))'; }

TS=$(date +%s)
check "signup" "$(curl -s -c "$J" -X POST "$B/api/auth/signup" -H 'content-type: application/json' -H "x-forwarded-for: 10.9.$((RANDOM%250)).$((RANDOM%250))" -d "{\"first\":\"PL\",\"last\":\"Admin\",\"facility\":\"Preloved Hospital $TS\",\"email\":\"pl$TS@example.com\",\"password\":\"password123\"}")" '"ok":true'
check "the facility names its staff groups" "$(e2e_groups "$B" "$J")" '"ok":true'
check "supplier" "$(mut supplier.add '{"name":"Alpha Supply"}')" '"id"'
check "dept" "$(mut dept.save '{"name":"Ward 1","cc":"100"}')" '"ok":true'
check "catalog" "$(mut import.rows '{"kind":"catalog","rows":[{"item":"RN Scrub Top","sku":"T1","supplier":"Alpha Supply","cost":"30","group":"Registered Nurse","sizes":"S|M"},{"item":"Scrub Pant","sku":"P1","supplier":"Alpha Supply","cost":"25","group":"Registered Nurse","sizes":"S|M"},{"item":"Security Shirt","sku":"S1","supplier":"Alpha Supply","cost":"40","group":"Security","sizes":"M|L"}]}')" '"created":3'
check "opening" "$(mut import.rows '{"kind":"opening","rows":[{"sku":"T1","size":"M","opening":"10"},{"sku":"P1","size":"M","opening":"10"},{"sku":"S1","size":"L","opening":"4"}]}')" '"created":3'
check "staff" "$(mut import.rows '{"kind":"staff","rows":[{"num":"1","first":"Nina","last":"Nurse","group":"Registered Nurse","dept":"Ward 1","top":"M","pants":"M"},{"num":"2","first":"Sam","last":"Guard","group":"Security","dept":"Ward 1","ent":"3","top":"L","pants":"L"}]}')" '"created":2'
BK=$(bk)
T1=$(echo "$BK" | py 'print([i["id"] for i in d["items"] if i["sku"]=="T1"][0])'); P1=$(echo "$BK" | py 'print([i["id"] for i in d["items"] if i["sku"]=="P1"][0])'); S1=$(echo "$BK" | py 'print([i["id"] for i in d["items"] if i["sku"]=="S1"][0])')
NINA=$(echo "$BK" | py 'print([s["id"] for s in d["staff"] if s["num"]=="1"][0])'); SAM=$(echo "$BK" | py 'print([s["id"] for s in d["staff"] if s["num"]=="2"][0])')

echo "== pool adjust"
check "pre-loved adjust +3" "$(mut stock.moves "{\"mode\":\"Pre-loved\",\"lines\":[{\"itemId\":\"$T1\",\"si\":1,\"qty\":3}]}")" '"ok":true'
check "pool T1/M = 3" "$(pool $T1 1)" '^3$'
check "pre-loved adjust -5 clamps to 0" "$(mut stock.moves "{\"mode\":\"Pre-loved\",\"lines\":[{\"itemId\":\"$T1\",\"si\":1,\"qty\":-5}]}")" '"ok":true'
check "pool clamped 0" "$(pool $T1 1)" '^0$'
check "pool adjust leaves shelf alone (no moves)" "$(bk | py 'print(len(d["moves"]))')" '^0$'
check "pre-loved adjust +2 again" "$(mut stock.moves "{\"mode\":\"Pre-loved\",\"lines\":[{\"itemId\":\"$T1\",\"si\":1,\"qty\":2}]}")" '"ok":true'

echo "== hand-ins"
check "hand-in needs lines" "$(mut handin.add "{\"staffId\":\"$SAM\",\"lines\":[]}")" 'at least one'
check "issue Sam 2 shirts from stock" "$(mut issue.create "{\"staffId\":\"$SAM\",\"lines\":[{\"itemId\":\"$S1\",\"si\":1,\"qty\":2,\"src\":\"stock\"}]}")" '"stock":2'
check "Sam has 2 shirts on his record" "$(bk | py 'print(sum(i["qty"] for i in d["issues"] if i["staffId"]=="'$SAM'" and not i["preloved"]))')" '^2$'
# The ceiling itself, proved by the refusal it should earn: he holds 2 shirts, and 5 more would be 7
# tops against the six anyone may hold. His register figure of 3 is a yearly reporting number now and
# refuses nothing on its own. Counting his issue rows never shows that.
check "Sam holds 2 tops, 5 more is past six" "$(mut issue.create "{\"staffId\":\"$SAM\",\"lines\":[{\"itemId\":\"$S1\",\"si\":1,\"qty\":5,\"src\":\"order\"}]}")" 'the most anyone holds is 6 sets'
R=$(mut handin.add "{\"staffId\":\"$SAM\",\"credit\":true,\"lines\":[{\"itemId\":\"$S1\",\"si\":1,\"qty\":1,\"cond\":\"Good\",\"laundered\":true},{\"itemId\":\"$S1\",\"si\":1,\"qty\":1,\"cond\":\"Rag\",\"laundered\":false}]}")
check "hand-in recorded" "$R" '"good":1,"rag":1,"credit":true'
check "hand-in message" "$R" '1 to the pre-loved pool · 1 to rag disposal · allowance credited'
check "pool S1/L = 1 (rag not pooled)" "$(pool $S1 1)" '^1$'
# Assert the quantity handed in, not the number of rows it landed on. A hand-in that covers part of
# an issue row now splits it, so two lines against one qty-2 row leave two stamped rows rather than
# one — the same two garments, recorded with the condition each of them actually went out under.
check "handedIn qty stamped on past issues" "$(bk | py 'print(sum(i["qty"] for i in d["issues"] if i["staffId"]=="'$SAM'" and i["handedIn"]))')" '^2$'
check "Sam holds nothing after handing both in" "$(bk | py 'print(sum(i["qty"] for i in d["issues"] if i["staffId"]=="'$SAM'" and not i["handedIn"] and not i["returnedDate"]))')" '^0$'
check "hand-in in backup" "$(bk | py 'print(len(d["handins"]), d["handins"][0]["credit"], len(d["handins"][0]["lines"]))')" '1 True 2'
# Both shirts handed in leaves him holding nothing, so two more go straight through: the room comes
# from what he gave back.
check "handing in freed room (2 more OK)" "$(mut issue.create "{\"staffId\":\"$SAM\",\"lines\":[{\"itemId\":\"$S1\",\"si\":1,\"qty\":2,\"src\":\"stock\"}]}")" '"stock":2'
# Holding 2 again, so 5 more is 7 tops — past the six, and refused without an override.
check "past six again is refused" "$(mut issue.create "{\"staffId\":\"$SAM\",\"lines\":[{\"itemId\":\"$S1\",\"si\":0,\"qty\":5,\"src\":\"order\"}]}")" 'the most anyone holds is 6 sets'

echo "== manager approval credit"
check "approval 2 sets" "$(mut approval.add "{\"staffId\":\"$NINA\",\"by\":\"J Manager\",\"sets\":\"2\"}")" '"id"'
check "issue Nina 2 sets from stock" "$(mut issue.create "{\"staffId\":\"$NINA\",\"apDeduct\":2,\"lines\":[{\"itemId\":\"$T1\",\"si\":1,\"qty\":2,\"src\":\"stock\"},{\"itemId\":\"$P1\",\"si\":1,\"qty\":2,\"src\":\"stock\"}]}")" '"apDeducted":2'
check "approval fully used" "$(bk | py 'print(d["approvals"][0]["used"])')" '^2$'
check "hand-in 1 top + 1 pant credited" "$(mut handin.add "{\"staffId\":\"$NINA\",\"credit\":true,\"lines\":[{\"itemId\":\"$T1\",\"si\":1,\"qty\":1,\"cond\":\"Good\"},{\"itemId\":\"$P1\",\"si\":1,\"qty\":1,\"cond\":\"Good\"}]}")" '"setsBack":1'
check "approval used back to 1" "$(bk | py 'print(d["approvals"][0]["used"])')" '^1$'
check "pool T1/M now 3 (2 adjust + 1 hand-in)" "$(pool $T1 1)" '^3$'

echo "== pre-loved issue"
SHELF_BEFORE=$(bk | py 'print(next(s["opening"]+s["adj"] for s in d["stock"] if s["itemId"]=="'$T1'" and s["sizeIndex"]==1))')
check "pre-loved over pool rejected" "$(mut issue.create "{\"staffId\":\"$NINA\",\"apDeduct\":0,\"lines\":[{\"itemId\":\"$T1\",\"si\":1,\"qty\":9,\"src\":\"preloved\"}]}")" 'Not enough pre-loved'
# The issue ASKS for two sets it must not be given. An approval is the ward agreeing to pay for new
# uniform; a pre-loved garment came back off somebody else, costs the ward nothing and goes out
# free, so spending a set on one takes something from the wearer the ward never spent. Nina has one
# set left here, so a request for two is refused by the rule rather than by arithmetic — and asking
# for none, as this line used to, would pass just as well with the rule deleted.
R=$(mut issue.create "{\"staffId\":\"$NINA\",\"apDeduct\":2,\"lines\":[{\"itemId\":\"$T1\",\"si\":1,\"qty\":2,\"src\":\"preloved\"}]}")
check "pre-loved issue ok" "$R" '"preloved":2'
check "no approval deduction, even though two sets were asked for" "$R" '"apDeducted":0'
check "  and the approval row is untouched" "$(bk | py 'print(d["approvals"][0]["used"])')" '^1$'
check "pool T1/M down to 1" "$(pool $T1 1)" '^1$'
# Drawing from the pool leaves the shelf where it was: the counted stock doesn't move and no
# movement is written, or a free garment quietly comes off the linen room's own figures.
check "pre-loved issue leaves the shelf alone" "$(bk | py 'print(next(s["opening"]+s["adj"] for s in d["stock"] if s["itemId"]=="'$T1'" and s["sizeIndex"]==1))')" "^$SHELF_BEFORE\$"
check "pre-loved issue writes no stock movement" "$(bk | py 'print(len(d["moves"]))')" '^0$'
# Anchored, because a top costs 30 and an unanchored "0 Pre-loved" matches "30 Pre-loved" just as
# happily — and costing the ward nothing is the half of this row that matters.
check "issue row preloved + cost 0" "$(bk | py 'i=[i for i in d["issues"] if i["preloved"]][0]; print(i["cost"], i["cond"])')" '^0 Pre-loved$'
check "no replenishment draft line for pre-loved (T1 M draft qty stays 2)" "$(bk | py 'print(sum(l["qty"] for o in d["orders"] if o["replenish"] for l in o["lines"] if l["itemId"]=="'$T1'" and l["size"]=="M"))')" '^2$'
check "issue Sam pre-loved not blocked by entitlement" "$(mut stock.moves "{\"mode\":\"Pre-loved\",\"lines\":[{\"itemId\":\"$S1\",\"si\":1,\"qty\":2}]}"; mut issue.create "{\"staffId\":\"$SAM\",\"lines\":[{\"itemId\":\"$S1\",\"si\":1,\"qty\":2,\"src\":\"preloved\"}]}")" '"preloved":2'

echo "== pool stocktake"
check "pool stocktake sets count" "$(mut stocktake.apply "{\"mode\":\"preloved\",\"lines\":[{\"itemId\":\"$T1\",\"si\":1,\"counted\":5},{\"itemId\":\"$P1\",\"si\":1,\"counted\":1}]}")" '"counted":2,"variances":1'
check "pool T1/M = 5 after pool take" "$(pool $T1 1)" '^5$'
check "shelf adj untouched by pool take" "$(bk | py 'print(next(s["adj"] for s in d["stock"] if s["itemId"]=="'$T1'" and s["sizeIndex"]==1))')" '^0$'
check "stocktake filed with mode preloved" "$(bk | py 'print([t["mode"] for t in d["stocktakes"]])')" "preloved"
check "shelf stocktake still shelf mode" "$(mut stocktake.apply "{\"lines\":[{\"itemId\":\"$T1\",\"si\":1,\"counted\":6}]}"; bk | py 'print(sorted(t["mode"] for t in d["stocktakes"]))')" "\['preloved', 'shelf'\]"

echo "== backup round-trip keeps the pool"
BKF=$(bk)
check "restore" "$(curl -s -b "$J" -X POST "$B/api/mutate" -H 'content-type: application/json' -d "{\"op\":\"backup.restore\",\"payload\":$BKF}")" '"ok":true'
# Name the garment and the size each figure belongs to, not just the numbers. A restore re-creates
# every row with a fresh id, so the pool is only really back if each count came down on the item and
# the size it was counted against — five pre-loved tops in M read as "a 5 in the list" whether they
# landed on the tops, on the pants, or on the small ones.
check "pool survived restore, on the right item and size" "$(bk | py 'it={i["id"]:i for i in d["items"]}; print(" ".join(sorted(it[s["itemId"]]["sku"]+"/"+it[s["itemId"]]["sizes"][s["sizeIndex"]]+"="+str(s["preloved"]) for s in d["stock"] if s["preloved"]>0)))')" '^P1/M=1 S1/L=1 T1/M=5$'
# Not the number of hand-ins: the garments that came back on them and the credit those earned.
# `credited` is what every wearer's entitlement is worked out from, so a restore that dropped it
# would move Sam from 3-used to 4-used with two hand-in rows sitting there looking perfectly right.
check "handins survived restore, lines and credit intact" "$(bk | py 'print(sorted((h["credit"], sum(l["qty"] for l in h["lines"]), sum(l["credited"] for l in h["lines"])) for h in d["handins"]))')" '^\[(True, 2, 1), (True, 2, 2)\]$'
# Garments, not rows: an issue row carries a quantity, so counting rows would call a restore that
# brought back one of Nina's two pre-loved tops a complete one. Free travels with them: a pre-loved
# garment that comes back priced at the catalogue cost starts charging a ward for something it was
# given, which is the one thing the pool exists not to do.
check "preloved issues survived restore, still free" "$(bk | py 'p=[i for i in d["issues"] if i["preloved"]]; print(sum(i["qty"] for i in p), sorted({i["cost"] for i in p}))')" '^4 \[0\]$'

echo; echo "PASS=$PASS FAIL=$FAIL"; [ "$FAIL" -eq 0 ]
