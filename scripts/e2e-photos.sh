#!/usr/bin/env bash
# Photos on disk: stored as files rather than base64, served only to the owning facility, and
# still whole in a backup.
set -u
B=${BASE:-http://127.0.0.1:3111}
# Refuses early, with the fix, when the server under test is in production mode with
# Turnstile refusing every auth route — otherwise the first signup fails and every check
# after it reports a security-check error instead of what it was testing.
. "$(dirname "$0")/e2e-preflight.sh"; e2e_preflight "$B"
T=${TMP:-/tmp}; J="$T/tc-ph-cj.txt"; K="$T/tc-ph-cj2.txt"; rm -f "$J" "$K"
PASS=0; FAIL=0
ok()   { PASS=$((PASS+1)); echo "  ✓ $1"; }
fail() { FAIL=$((FAIL+1)); echo "  ✗ $1 :: $2"; }
mut()  { curl -s -b "$J" -c "$J" -X POST "$B/api/mutate" -H 'content-type: application/json' -d "{\"op\":\"$1\",\"payload\":$2}"; }
check(){ local name=$1 out=$2 pat=$3; if echo "$out" | grep -q "$pat"; then ok "$name"; else fail "$name" "$(echo "$out" | head -c 200)"; fi; }
py()   { python3 -c "import sys,json; d=json.load(sys.stdin); $1"; }

# A real 1x1 JPEG, so what is written is a genuine image rather than random bytes.
JPEG_B64=$(python3 -c "
import base64
# smallest valid JPEG
b = bytes.fromhex('ffd8ffe000104a46494600010100000100010000ffdb004300ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffc00011080001000101011100ffc40014000100000000000000000000000000000009ffc40014100100000000000000000000000000000000ffda0008010100003f0054df')
print(base64.b64encode(b).decode())
")
DATAURL="data:image/jpeg;base64,$JPEG_B64"

TS=$(date +%s)
echo "== setup"
check "signup" "$(curl -s -c "$J" -X POST "$B/api/auth/signup" -H 'content-type: application/json' \
  -H "x-forwarded-for: 10.17.$((RANDOM%250)).$((RANDOM%250))" \
  -d "{\"first\":\"Pia\",\"last\":\"Photo\",\"facility\":\"Photo Hospital $TS\",\"email\":\"ph$TS@example.com\",\"password\":\"password123\"}")" '"ok":true'
check "the facility names its staff groups" "$(e2e_groups "$B" "$J")" '"ok":true'

echo "== storing"
R=$(mut photo.put "{\"kind\":\"sig\",\"data\":\"$DATAURL\"}")
check "photo accepted" "$R" '"id"'
PID=$(echo "$R" | py "print(d['result']['id'])")

echo "== it is on disk, not in the database"
ROW=$(curl -s -b "$J" "$B/api/backup" | py "
ph = [x for x in d['photos'] if x['id']=='$PID'][0]
print('path=' + (ph.get('path') or '') + ' mime=' + (ph.get('mime') or '') + ' bytes=' + str(ph.get('bytes')))
")
# Named after the row id we generated, never after anything the request supplied — the trailing
# space keeps the match inside the path field, so an empty path cannot borrow the slash in the mime.
check "the row records a file path" "$ROW" "path=[A-Za-z0-9_-]\{1,\}/$PID\.jpg "
check "and the mime type" "$ROW" 'mime=image/jpeg'
# The decoded image is 143 bytes (192 as base64). Pinning the number is what catches bytes ever
# recording the encoded length instead of the real size of the file on disk.
check "and the size" "$ROW" 'bytes=143$'

echo "== serving"
CT=$(curl -s -b "$J" -o /dev/null -w '%{content_type} %{http_code}' "$B/api/photo/$PID")
check "served as a jpeg" "$CT" 'image/jpeg 200'
check "signed out is refused" "$(curl -s -o /dev/null -w '%{http_code}' "$B/api/photo/$PID")" '401'

echo "== another facility cannot read it"
check "second facility signs up" "$(curl -s -c "$K" -X POST "$B/api/auth/signup" -H 'content-type: application/json' \
  -H "x-forwarded-for: 10.18.$((RANDOM%250)).$((RANDOM%250))" \
  -d "{\"first\":\"Oth\",\"last\":\"Er\",\"facility\":\"Other Photo $TS\",\"email\":\"pho$TS@example.com\",\"password\":\"password123\"}")" '"ok":true'
check "their request 404s" "$(curl -s -b "$K" -o /dev/null -w '%{http_code}' "$B/api/photo/$PID")" '404'

echo "== the backup is still whole"
# Byte-identical to what went in, not merely a data URL with the right prefix: the prefix is built
# from the mime column, so a truncated or wrong file on disk still produces one.
check "backup embeds the image" "$(curl -s -b "$J" "$B/api/backup" | py "
ph = [x for x in d['photos'] if x['id']=='$PID'][0]
print('same' if ph.get('data') == '$DATAURL' else 'DIFFERENT')
")" 'same'

echo "== rubbish is refused"
check "not an image" "$(mut photo.put '{"kind":"sig","data":"data:text/html;base64,PGgxPmhp"}')" 'JPEG or PNG'
check "empty" "$(mut photo.put '{"kind":"sig","data":""}')" 'JPEG or PNG'

echo; echo "PASS=$PASS FAIL=$FAIL"; [ "$FAIL" -eq 0 ]
