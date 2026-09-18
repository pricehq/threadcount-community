#!/usr/bin/env bash
# Scan-to-add / scan-a-size / start-fresh: catalog.add with barcodes, catalog.variantAdd,
# ambiguous-binding guards, /api/lookup gating and data.reset.
set -u
B=${BASE:-http://127.0.0.1:3111}
# Refuses early, with the fix, when the server under test is in production mode with
# Turnstile refusing every auth route — otherwise the first signup fails and every check
# after it reports a security-check error instead of what it was testing.
. "$(dirname "$0")/e2e-preflight.sh"; e2e_preflight "$B"
T=${TMP:-/tmp}; J="$T/tc-scan-cj.txt"; J2="$T/tc-scan-cj2.txt"; rm -f "$J" "$J2"
PASS=0; FAIL=0
ok()   { PASS=$((PASS+1)); echo "  ✓ $1"; }
fail() { FAIL=$((FAIL+1)); echo "  ✗ $1 :: $2"; }
mut()  { curl -s -b "$J" -c "$J" -X POST "$B/api/mutate" -H 'content-type: application/json' -d "{\"op\":\"$1\",\"payload\":$2}"; }
mut2() { curl -s -b "$J2" -c "$J2" -X POST "$B/api/mutate" -H 'content-type: application/json' -d "{\"op\":\"$1\",\"payload\":$2}"; }
check(){ local name=$1 out=$2 pat=$3; if echo "$out" | grep -q "$pat"; then ok "$name"; else fail "$name" "$(echo "$out" | head -c 300)"; fi; }
no()   { local name=$1 out=$2 pat=$3; if echo "$out" | grep -q "$pat"; then fail "$name" "$(echo "$out" | head -c 300)"; else ok "$name"; fi; }
py()   { python3 -c "import sys,json; d=json.load(sys.stdin); $1"; }
XFF="x-forwarded-for: 10.7.$((RANDOM%250)).$((RANDOM%250))"

TS=$(date +%s)
echo "== setup"
check "signup admin" "$(curl -s -c "$J" -X POST "$B/api/auth/signup" -H 'content-type: application/json' -H "$XFF" -d "{\"first\":\"Scan\",\"last\":\"Admin\",\"facility\":\"Scan Hospital $TS\",\"email\":\"scan$TS@example.com\",\"password\":\"password123\"}")" '"ok":true'
check "the facility names its staff groups" "$(e2e_groups "$B" "$J")" '"ok":true'
check "supplier" "$(mut supplier.add '{"name":"Northline Workwear"}')" '"id"'

echo "== quick add from a scan (catalog.add + barcodes)"
R=$(mut catalog.add '{"item":"Scrub Top","gender":"Unisex","group":"All","sku":"ST-1","supplier":"Northline Workwear","cost":24.5,"sizes":["S","M","L"],"barcodes":[{"si":1,"code":"9312345678907"}]}')
check "created with a bound barcode" "$R" '"id"'
IT=$(echo "$R" | py 'print(d["result"]["id"])')
BK=$(curl -s -b "$J" "$B/api/backup")
check "barcode stored against size index 1" "$(echo "$BK" | py 'print([(b["code"],b["sizeIndex"]) for b in d["barcodes"]])')" "9312345678907', 1"
check "barcode source is bound" "$(echo "$BK" | py 'print(d["barcodes"][0]["source"])')" '^bound$'
check "size out of range rejected" "$(mut catalog.add '{"item":"Bad","cost":1,"sizes":["S"],"barcodes":[{"si":4,"code":"111"}]}')" 'has to point at one of the sizes'
check "no item created by the rejected add" "$(curl -s -b "$J" "$B/api/backup" | py 'print(len(d["items"]))')" '^1$'

echo "== scan a size onto an existing product (catalog.variantAdd)"
check "bind a code to an existing size" "$(mut catalog.variantAdd "{\"itemId\":\"$IT\",\"size\":\"S\",\"code\":\"9312345678891\"}")" '"si":0'
check "existing size not duplicated" "$(curl -s -b "$J" "$B/api/backup" | py 'print(d["items"][0]["sizes"])')" "\['S', 'M', 'L'\]"
R=$(mut catalog.variantAdd "{\"itemId\":\"$IT\",\"size\":\"2XL\",\"code\":\"9312345678914\"}")
check "new size appended" "$R" '"si":3'
check "new size reported as created" "$R" '"created":true'
check "sizes now 4" "$(curl -s -b "$J" "$B/api/backup" | py 'print(d["items"][0]["sizes"])')" "\['S', 'M', 'L', '2XL'\]"
check "3 barcodes bound" "$(curl -s -b "$J" "$B/api/backup" | py 'print(len(d["barcodes"]))')" '^3$'
check "size is case-insensitive (no duplicate)" "$(mut catalog.variantAdd "{\"itemId\":\"$IT\",\"size\":\"2xl\",\"code\":\"9312345678921\"}")" '"si":3'
check "still 4 sizes" "$(curl -s -b "$J" "$B/api/backup" | py 'print(len(d["items"][0]["sizes"]))')" '^4$'
check "blank size rejected" "$(mut catalog.variantAdd "{\"itemId\":\"$IT\",\"size\":\"  \",\"code\":\"9312345678938\"}")" 'Size required'

echo "== ambiguous bindings are refused"
check "code already on another size" "$(mut barcode.bind "{\"itemId\":\"$IT\",\"si\":2,\"code\":\"9312345678907\"}")" 'is already on Scrub Top · size M'
check "same code, same size is a no-op not an error" "$(mut barcode.bind "{\"itemId\":\"$IT\",\"si\":1,\"code\":\"9312345678907\"}")" '"ok":true'
check "force moves it" "$(mut barcode.bind "{\"itemId\":\"$IT\",\"si\":2,\"code\":\"9312345678907\",\"force\":true}")" '"ok":true'
check "moved to size index 2" "$(curl -s -b "$J" "$B/api/backup" | py 'print([b["sizeIndex"] for b in d["barcodes"] if b["code"]=="9312345678907"][0])')" '^2$'
R2=$(mut catalog.add '{"item":"Cargo Pant","cost":30,"sizes":["S","M"]}')
IT2=$(echo "$R2" | py 'print(d["result"]["id"])')
SORT2=$(curl -s -b "$J" "$B/api/backup" | py "print([i['sort'] for i in d['items'] if i['id']=='$IT2'][0])")
GEN=$((930000000 + SORT2 * 100 + 1))
check "generated code of another item is refused" "$(mut barcode.bind "{\"itemId\":\"$IT\",\"si\":0,\"code\":\"$GEN\"}")" 'generated code for Cargo Pant'
check "generated code onto its own item is fine" "$(mut barcode.bind "{\"itemId\":\"$IT2\",\"si\":1,\"code\":\"$GEN\"}")" '"ok":true'

echo "== printing our own barcode for a garment that arrived without one"
# Whole ranges turn up unlabelled and a garment nobody can scan is invisible to a count. The number
# has to be one GS1 will never issue to a manufacturer, so it is a real EAN-13 in the restricted
# circulation range (prefix 29) — a genuine check digit, readable by any scanner in the building.
RG=$(mut catalog.add '{"item":"Cafe Shirt","cost":34.1,"sizes":["8","10","12"]}')
ITG=$(echo "$RG" | py 'print(d["result"]["id"])')
check "a garment with no codes at all" "$(curl -s -b "$J" "$B/api/backup" | py "print(len([b for b in d['barcodes'] if b['itemId']=='$ITG']))")" '^0$'
# One supplier code already on the middle size: generating must fill the gaps and leave that alone.
check "one size already carries a supplier code" "$(mut barcode.bind "{\"itemId\":\"$ITG\",\"si\":1,\"code\":\"9312345678952\"}")" '"ok":true'
G=$(mut barcode.generate "{\"itemId\":\"$ITG\"}")
check "generates for the sizes that have none" "$G" '"count":2'
check "  and says which sizes it did" "$(echo "$G" | py 'print(sorted(x["size"] for x in d["result"]["made"]))')" "\['12', '8'\]"
check "every generated code is a 13-digit 29 code" "$(echo "$G" | py 'print(all(len(x["code"])==13 and x["code"].isdigit() and x["code"].startswith("29") for x in d["result"]["made"]))')" '^True$'
# A wrong check digit is a label that prints and then will not scan, which is worse than no label.
check "  with a valid check digit" "$(echo "$G" | py '
def cd(f):
    return (10 - sum(int(c)*(1 if i%2==0 else 3) for i,c in enumerate(f[:12])) % 10) % 10
print(all(cd(x["code"]) == int(x["code"][12]) for x in d["result"]["made"]))')" '^True$'
check "  and they are all different" "$(echo "$G" | py 'print(len({x["code"] for x in d["result"]["made"]}))')" '^2$'
check "the supplier code was left where it was" "$(curl -s -b "$J" "$B/api/backup" | py "print([b['code'] for b in d['barcodes'] if b['itemId']=='$ITG' and b['sizeIndex']==1][0])")" '^9312345678952$'
check "every size is now labelled" "$(curl -s -b "$J" "$B/api/backup" | py "print(len([b for b in d['barcodes'] if b['itemId']=='$ITG']))")" '^3$'
# The two refusals differ only in their wording, and the wording is the only sign of which path
# ran. A whole-garment answer to a one-size request means the si was ignored — and what follows
# that is a whole rack relabelled when one hook was asked about.
check "asking again says there is nothing to do" "$(mut barcode.generate "{\"itemId\":\"$ITG\"}")" 'Every size on this garment already has a barcode'
check "and a single size that is taken says so too" "$(mut barcode.generate "{\"itemId\":\"$ITG\",\"si\":0}")" 'That size already has a barcode'
# The generated code is a real binding, so it resolves on a scan like any other.
GC=$(echo "$G" | py 'print([x["code"] for x in d["result"]["made"] if x["size"]=="8"][0])')
check "a generated code scans back to its own size" "$(curl -s -b "$J" "$B/api/backup" | py "print([b['sizeIndex'] for b in d['barcodes'] if b['code']=='$GC'][0])")" '^0$'
# One size at a time is the other half of the op, and proving it needs a garment with more than
# one gap: somebody holding a single unlabelled size gets one label, not a fresh number printed
# over every size on the garment.
RC=$(mut catalog.add '{"item":"Theatre Cap","cost":6,"sizes":["S","M"]}')
ITC=$(echo "$RC" | py 'print(d["result"]["id"])')
G2=$(mut barcode.generate "{\"itemId\":\"$ITC\",\"si\":1}")
check "one size asked for, one code made" "$G2" '"count":1'
check "  and it is the size that was asked for" "$(echo "$G2" | py 'print([x["size"] for x in d["result"]["made"]])')" "\['M'\]"
check "  and the other size is left unlabelled" "$(curl -s -b "$J" "$B/api/backup" | py "print([b['sizeIndex'] for b in d['barcodes'] if b['itemId']=='$ITC'])")" "\[1\]"

echo "== Set on hand records the difference, not the number"
# Stock the hand-in pool first. An empty pool answers 0 whether Set left it alone or ate the lot,
# and the seconds sitting in it were never on the shelf the count is correcting. Safe to leave in
# place for the rest of the section: the pool sits outside on-hand.
mut stock.moves "{\"mode\":\"Pre-loved\",\"lines\":[{\"itemId\":\"$IT\",\"si\":1,\"qty\":3}]}" >/dev/null
check "receive 3 onto a fresh size" "$(mut stock.moves "{\"mode\":\"Receive\",\"lines\":[{\"itemId\":\"$IT\",\"si\":1,\"qty\":3}]}")" '"ok":true'
oh() { curl -s -b "$J" "$B/api/backup" | py "
import sys
st=[s for s in d['stock'] if s['itemId']=='$IT' and s['sizeIndex']==1]
base=(st[0]['opening']+st[0]['adj']) if st else 0
mv=sum(m['qty'] for m in d['moves'] if m['itemId']=='$IT' and m['sizeIndex']==1)
iss=sum(i['qty'] for i in d['issues'] if i['itemId']=='$IT' and i['sizeIndex']==1 and not i.get('direct'))
print(base+mv-iss)"; }
check "on hand is 3" "$(oh)" '^3$'
check "set it to 2 (the count)" "$(mut stock.moves "{\"mode\":\"Set\",\"lines\":[{\"itemId\":\"$IT\",\"si\":1,\"qty\":2}]}")" '"ok":true'
check "on hand is now 2, not 5" "$(oh)" '^2$'
check "the difference was recorded as -1" "$(curl -s -b "$J" "$B/api/backup" | py "print([m['qty'] for m in d['moves'] if m['itemId']=='$IT' and m['sizeIndex']==1][-1])")" '^-1$'
check "recorded as an adjust with a reason" "$(curl -s -b "$J" "$B/api/backup" | py "m=[m for m in d['moves'] if m['itemId']=='$IT' and m['sizeIndex']==1][-1]; print(m['type'], m['reason'])")" 'adjust Counted correction'
check "setting to the same number records nothing" "$(mut stock.moves "{\"mode\":\"Set\",\"lines\":[{\"itemId\":\"$IT\",\"si\":1,\"qty\":2}]}" >/dev/null; curl -s -b "$J" "$B/api/backup" | py "print(len([m for m in d['moves'] if m['itemId']=='$IT' and m['sizeIndex']==1]))")" '^2$'
check "set upward to 9 works too" "$(mut stock.moves "{\"mode\":\"Set\",\"lines\":[{\"itemId\":\"$IT\",\"si\":1,\"qty\":9}]}" >/dev/null; oh)" '^9$'
check "set back to 0 empties the line" "$(mut stock.moves "{\"mode\":\"Set\",\"lines\":[{\"itemId\":\"$IT\",\"si\":1,\"qty\":0}]}" >/dev/null; oh)" '^0$'
check "negative count refused" "$(mut stock.moves "{\"mode\":\"Set\",\"lines\":[{\"itemId\":\"$IT\",\"si\":1,\"qty\":-2}]}")" "can't be negative"
check "bad mode still refused" "$(mut stock.moves "{\"mode\":\"Nonsense\",\"lines\":[{\"itemId\":\"$IT\",\"si\":1,\"qty\":1}]}")" 'Bad mode'
check "Set does not touch the pre-loved pool" "$(curl -s -b "$J" "$B/api/backup" | py "print(sum(s['preloved'] for s in d['stock'] if s['itemId']=='$IT'))")" '^3$'
# On a size that carries a real opening balance, counted to a different figure, so the answer
# can't be mistaken for either number. Size 0 is untouched by the size-1 arithmetic above.
mut stock.moves "{\"mode\":\"Opening\",\"lines\":[{\"itemId\":\"$IT\",\"si\":0,\"qty\":5}]}" >/dev/null
mut stock.moves "{\"mode\":\"Set\",\"lines\":[{\"itemId\":\"$IT\",\"si\":0,\"qty\":2}]}" >/dev/null
check "Set does not rewrite the opening balance" "$(curl -s -b "$J" "$B/api/backup" | py "print([s['opening'] for s in d['stock'] if s['itemId']=='$IT' and s['sizeIndex']==0][0])")" '^5$'

echo "== duplicate a garment for another colour"
check "reorder level on the source" "$(mut stock.reorder "{\"itemId\":\"$IT\",\"si\":0,\"reorder\":6}")" '"ok":true'
# Give the source a real product type before copying it. Type is what files a garment under Tops
# or Bottoms, so a duplicate that quietly drops it puts the new colour under the wrong heading —
# and a blank type on both sides would agree with itself and prove nothing.
check "product type on the source" "$(mut catalog.update "{\"id\":\"$IT\",\"type\":\"Scrub top\"}")" '"ok":true'
R=$(mut catalog.duplicate "{\"id\":\"$IT\",\"item\":\"Scrub Top — EN (Navy)\",\"group\":\"Enrolled Nurse\",\"sku\":\"ST-EN\"}")
check "duplicate created" "$R" '"id"'
check "reports the size count" "$R" '"sizes":4'
DUP=$(echo "$R" | py 'print(d["result"]["id"])')
BK=$(curl -s -b "$J" "$B/api/backup")
check "name applied" "$(echo "$BK" | py "print([i['item'] for i in d['items'] if i['id']=='$DUP'][0])")" 'Scrub Top — EN (Navy)'
check "group applied" "$(echo "$BK" | py "print([i['group'] for i in d['items'] if i['id']=='$DUP'][0])")" '^Enrolled Nurse$'
check "sku applied" "$(echo "$BK" | py "print([i['sku'] for i in d['items'] if i['id']=='$DUP'][0])")" '^ST-EN$'
check "sizes copied" "$(echo "$BK" | py "print([i['sizes'] for i in d['items'] if i['id']=='$DUP'][0] == [i['sizes'] for i in d['items'] if i['id']=='$IT'][0])")" '^True$'
check "cost/supplier/gender/type copied" "$(echo "$BK" | py "src=[i for i in d['items'] if i['id']=='$IT'][0]; c=[i for i in d['items'] if i['id']=='$DUP'][0]; print(c['cost']==src['cost'] and c['supplier']==src['supplier'] and c['gender']==src['gender'] and c['type']==src['type']=='Scrub top')")" '^True$'
check "reorder level carried over" "$(echo "$BK" | py "print([s['reorder'] for s in d['stock'] if s['itemId']=='$DUP' and s['sizeIndex']==0][0])")" '^6$'
check "NO barcodes copied" "$(echo "$BK" | py "print(len([b for b in d['barcodes'] if b['itemId']=='$DUP']))")" '^0$'
check "NO stock copied" "$(echo "$BK" | py "print(sum(s['opening']+s['adj'] for s in d['stock'] if s['itemId']=='$DUP'))")" '^0$'
# Every one of the source's codes by name: a duplicate that dragged three of the four across to
# the new colour would leave one behind and satisfy a mere "still has some".
check "source untouched" "$(echo "$BK" | py "print(sorted(b['code'] for b in d['barcodes'] if b['itemId']=='$IT'))")" "\['9312345678891', '9312345678907', '9312345678914', '9312345678921'\]"
check "same name and group refused" "$(mut catalog.duplicate "{\"id\":\"$IT\",\"item\":\"Scrub Top — EN (Navy)\",\"group\":\"Enrolled Nurse\"}")" 'already exists for Enrolled Nurse'
check "same name, different group allowed" "$(mut catalog.duplicate "{\"id\":\"$IT\",\"item\":\"Scrub Top — EN (Navy)\",\"group\":\"Registered Nurse\"}")" '"id"'
check "unknown source refused" "$(mut catalog.duplicate '{"id":"nope","item":"X"}')" 'Unknown catalogue item'
check "each colour keeps its own barcode" "$(mut barcode.bind "{\"itemId\":\"$DUP\",\"si\":0,\"code\":\"9300222000003\"}")" '"ok":true'
check "binding the colour did not move the source's code" "$(curl -s -b "$J" "$B/api/backup" | py "print(len([b for b in d['barcodes'] if b['itemId']=='$IT'])==4 and [(b['code'],b['sizeIndex']) for b in d['barcodes'] if b['itemId']=='$DUP']==[('9300222000003', 0)])")" '^True$'

echo "== product lookup is off until an admin turns it on"
check "lookup default off" "$(curl -s -b "$J" "$B/api/lookup?code=9312345678907" | py 'print(d["enabled"])')" '^False$'
check "off explains itself" "$(curl -s -b "$J" "$B/api/lookup?code=9312345678907")" 'Product lookup is off'
check "GTIN still decoded while off" "$(curl -s -b "$J" "$B/api/lookup?code=9312345678907" | py 'print(d["gtin"]["kind"], d["gtin"]["valid"], d["gtin"]["origin"])')" 'EAN-13 True Australia'
check "bad check digit flagged" "$(curl -s -b "$J" "$B/api/lookup?code=9312345678901" | py 'print(d["gtin"]["valid"])')" '^False$'
check "turn lookup on" "$(mut settings.update '{"barcodeLookup":true}')" '"ok":true'
check "lookup now enabled" "$(curl -s -b "$J" "$B/api/lookup?code=9312345678907" | py 'print(d["enabled"])')" '^True$'
check "mis-read code is never sent out" "$(curl -s -b "$J" "$B/api/lookup?code=9312345678901")" "check digit doesn't match"
check "non-GTIN code is never sent out" "$(curl -s -b "$J" "$B/api/lookup?code=ABC123")" 'Not a standard retail barcode'
check "signed-out lookup refused" "$(curl -s "$B/api/lookup?code=9312345678907")" 'Not signed in'
# The public barcode databases belong to somebody else: they go down, they run the day's free
# quota out, and the linen room still has to be told something. Either a name came back or a note
# says in plain words why not — never a blank answer and never a stack trace.
check "lookup answers even when the public product database doesn't" "$(curl -s -b "$J" "$B/api/lookup?code=9312345678907" | py 'print(d["enabled"], bool(d.get("name") or d.get("note")))')" '^True True$'
check "turn lookup back off" "$(mut settings.update '{"barcodeLookup":false}')" '"ok":true'

echo "== issuer can scan but not bind"
check "add issuer" "$(mut users.add "{\"first\":\"Iss\",\"last\":\"Uer\",\"email\":\"iss$TS@example.com\",\"password\":\"password123\",\"role\":\"ISSUER\"}")" '"ok":true\|"id"'
check "issuer login" "$(curl -s -c "$J2" -X POST "$B/api/auth/login" -H 'content-type: application/json' -H "$XFF" -d "{\"email\":\"iss$TS@example.com\",\"password\":\"password123\"}")" '"ok":true'
check "issuer can't bind" "$(mut2 barcode.bind "{\"itemId\":\"$IT\",\"si\":0,\"code\":\"9300000000000\"}")" 'Admin only'
check "issuer can't add a variant" "$(mut2 catalog.variantAdd "{\"itemId\":\"$IT\",\"size\":\"4XL\",\"code\":\"9300000000001\"}")" 'Admin only'
check "issuer can't duplicate" "$(mut2 catalog.duplicate "{\"id\":\"$IT\",\"item\":\"Sneaky\"}")" 'Admin only'
check "issuer can't set a counted quantity" "$(mut2 stock.moves "{\"mode\":\"Set\",\"lines\":[{\"itemId\":\"$IT\",\"si\":0,\"qty\":1}]}")" 'Admin only'
check "issuer can't look up" "$(curl -s -b "$J2" "$B/api/lookup?code=9312345678907")" 'Admin only'
check "issuer can't reset the facility" "$(mut2 data.reset '{"confirm":"RESET"}')" 'Admin only'

echo "== product type + opening stock on create"
R=$(mut catalog.add '{"item":"Ward Dress","type":"Dress","cost":40,"sizes":["8","10","12"],"barcodes":[{"si":0,"code":"9300111000005"},{"si":1,"code":"9300111000012"}],"opening":[{"si":0,"qty":4},{"si":2,"qty":7}]}')
check "created with type, barcodes and opening" "$R" '"id"'
DR=$(echo "$R" | py 'print(d["result"]["id"])')
BK=$(curl -s -b "$J" "$B/api/backup")
check "type stored" "$(echo "$BK" | py "print([i['type'] for i in d['items'] if i['id']=='$DR'][0])")" '^Dress$'
check "two barcodes bound on create" "$(echo "$BK" | py "print(sorted((b['code'],b['sizeIndex']) for b in d['barcodes'] if b['itemId']=='$DR'))")" "\[('9300111000005', 0), ('9300111000012', 1)\]"
check "opening set on size 0 and 2" "$(echo "$BK" | py "print(sorted((s['sizeIndex'],s['opening']) for s in d['stock'] if s['itemId']=='$DR'))")" "\[(0, 4), (2, 7)\]"
check "size with no opening has no level row" "$(echo "$BK" | py "print(len([s for s in d['stock'] if s['itemId']=='$DR']))")" '^2$'
check "duplicate barcode across sizes rejected" "$(mut catalog.add '{"item":"Dup","cost":1,"sizes":["S","M"],"barcodes":[{"si":0,"code":"9300111000029"},{"si":1,"code":"9300111000029"}]}')" 'same barcode is on two sizes'
check "barcode already on another garment rejected at create" "$(mut catalog.add '{"item":"Steal","cost":1,"sizes":["S"],"barcodes":[{"si":0,"code":"9300111000005"}]}')" 'is already on Ward Dress'
check "negative opening rejected" "$(mut catalog.add '{"item":"Neg","cost":1,"sizes":["S"],"opening":[{"si":0,"qty":-3}]}')" "can't be negative"
check "opening pointing at a missing size rejected" "$(mut catalog.add '{"item":"Bad","cost":1,"sizes":["S"],"opening":[{"si":5,"qty":1}]}')" 'has to point at one of the sizes'
check "nothing created by the rejected adds" "$(curl -s -b "$J" "$B/api/backup" | py "print(len([i for i in d['items'] if i['item'] in ('Dup','Steal','Neg','Bad')]))")" '^0$'

echo "== product type drives the tops/pants split"
check "type can be edited" "$(mut catalog.update "{\"id\":\"$DR\",\"type\":\"Tunic\"}")" '"ok":true'
check "type updated" "$(curl -s -b "$J" "$B/api/backup" | py "print([i['type'] for i in d['items'] if i['id']=='$DR'][0])")" '^Tunic$'
check "type survives a CSV import column" "$(mut import.rows '{"kind":"catalog","rows":[{"item":"Cargo Pant CSV","type":"Cargo pants","cost":"30","sizes":"77|82"}]}')" '"created":1'
check "imported type stored" "$(curl -s -b "$J" "$B/api/backup" | py "print([i['type'] for i in d['items'] if i['item']=='Cargo Pant CSV'][0])")" '^Cargo pants$'

echo "== backup round-trip keeps type"
BK2=$(curl -s -b "$J" "$B/api/backup")
echo "$BK2" > "$T/tc-scan-backup.json"
check "restore" "$(curl -s -b "$J" -X POST "$B/api/mutate" -H 'content-type: application/json' -d "{\"op\":\"backup.restore\",\"payload\":$(cat "$T/tc-scan-backup.json")}")" '"ok":true'
check "type survived restore" "$(curl -s -b "$J" "$B/api/backup" | py "print(sorted(i['type'] for i in d['items'] if i['type']))")" "Cargo pants.*Tunic"
# Restore re-creates every row with fresh ids, so re-resolve the item the later checks use.
IT=$(curl -s -b "$J" "$B/api/backup" | py 'print([i["id"] for i in d["items"] if i["sku"]=="ST-1"][0])')

echo "== start fresh (data.reset)"
check "dept" "$(mut dept.save '{"name":"Ward 9","cc":"900"}')" '"ok":true'
check "staff" "$(mut import.rows '{"kind":"staff","rows":[{"num":"77","first":"Sam","last":"Reed","group":"Registered Nurse","dept":"Ward 9","top":"M","pants":"M"}]}')" '"created":1'
ST=$(curl -s -b "$J" "$B/api/backup" | py 'print(d["staff"][0]["id"])')
check "opening balance" "$(mut stock.moves "{\"mode\":\"Opening\",\"lines\":[{\"itemId\":\"$IT\",\"si\":0,\"qty\":10}]}")" '"ok":true'
check "an issue exists" "$(mut issue.create "{\"staffId\":\"$ST\",\"apDeduct\":0,\"lines\":[{\"itemId\":\"$IT\",\"si\":0,\"qty\":1,\"src\":\"shelf\"}]}")" '"ok":true\|"id"'
check "wrong confirmation refused" "$(mut data.reset '{"confirm":"reset"}')" 'Type RESET to confirm'
check "data still there" "$(curl -s -b "$J" "$B/api/backup" | py 'print(len(d["items"]), len(d["staff"]), len(d["issues"]))')" '^8 1 1$'
check "reset" "$(mut data.reset '{"confirm":"RESET"}')" '"ok":true'
BK=$(curl -s -b "$J" "$B/api/backup")
check "catalogue empty" "$(echo "$BK" | py 'print(len(d["items"]))')" '^0$'
check "barcodes empty" "$(echo "$BK" | py 'print(len(d["barcodes"]))')" '^0$'
check "stock levels empty" "$(echo "$BK" | py 'print(len(d["stock"]))')" '^0$'
check "staff empty" "$(echo "$BK" | py 'print(len(d["staff"]))')" '^0$'
check "departments empty" "$(echo "$BK" | py 'print(len(d["depts"]))')" '^0$'
check "suppliers empty" "$(echo "$BK" | py 'print(len(d["suppliers"]))')" '^0$'
check "issues empty" "$(echo "$BK" | py 'print(len(d["issues"]))')" '^0$'
check "orders empty" "$(echo "$BK" | py 'print(len(d["orders"]))')" '^0$'
check "moves empty" "$(echo "$BK" | py 'print(len(d["moves"]))')" '^0$'
check "facility name kept" "$(echo "$BK" | py 'print(d["facility"]["name"])')" "Scan Hospital $TS"
check "staff groups kept" "$(echo "$BK" | py 'print(len(d["facility"]["staffGroups"])>0)')" '^True$'
check "numbering restarted" "$(echo "$BK" | py 'print(d["facility"]["orderSeq"], d["facility"]["catalogSeq"])')" '^0 0$'
check "logins kept — admin still signed in" "$(mut dept.save '{"name":"Ward 1","cc":"100"}')" '"ok":true'
check "first product after reset is sort 1" "$(mut catalog.add '{"item":"Fresh Top","cost":10,"sizes":["M"]}' >/dev/null; curl -s -b "$J" "$B/api/backup" | py 'print(d["items"][0]["sort"])')" '^1$'
check "keepSuppliers option" "$(mut supplier.add '{"name":"Keepme"}' >/dev/null; mut data.reset '{"confirm":"RESET","keepSuppliers":true}')" '"ok":true'
check "supplier survived" "$(curl -s -b "$J" "$B/api/backup" | py 'print([x["name"] for x in d["suppliers"]])')" 'Keepme'

echo
echo "PASS=$PASS FAIL=$FAIL"
[ "$FAIL" -eq 0 ]
