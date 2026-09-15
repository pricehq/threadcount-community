#!/usr/bin/env bash
# Staff self-service: claiming your own record, and the walls around it.
#
# Most of this file is about what a staff session must NOT be able to do. The whole design rests on
# a wearer's cookie being a different kind of thing from a coordinator's, so the checks that matter
# are the ones that try to use one as the other.
set -u
B=${BASE:-http://127.0.0.1:3111}
# Refuses early, with the fix, when the server under test is in production mode with
# Turnstile refusing every auth route — otherwise the first signup fails and every check
# after it reports a security-check error instead of what it was testing.
. "$(dirname "$0")/e2e-preflight.sh"; e2e_preflight "$B"
T=${TMP:-/tmp}
C="$T/tc-ss-coord.txt"      # coordinator jar
S="$T/tc-ss-staff.txt"      # staff jar
S2="$T/tc-ss-staff2.txt"    # a second staff member
rm -f "$C" "$S" "$S2"
PASS=0; FAIL=0
ok()   { PASS=$((PASS+1)); echo "  ✓ $1"; }
fail() { FAIL=$((FAIL+1)); echo "  ✗ $1 :: $2"; }
check(){ local name=$1 out=$2 pat=$3; if echo "$out" | grep -q "$pat"; then ok "$name"; else fail "$name" "$(echo "$out" | head -c 220)"; fi; }
no()   { local name=$1 out=$2 pat=$3; if echo "$out" | grep -q "$pat"; then fail "$name" "$(echo "$out" | head -c 220)"; else ok "$name"; fi; }
mut()  { curl -s -b "$C" -c "$C" -X POST "$B/api/mutate" -H 'content-type: application/json' -H "origin: $B" -d "{\"op\":\"$1\",\"payload\":$2}"; }
spost(){ curl -s -b "$S" -c "$S" -X POST "$B$1" -H 'content-type: application/json' -H "origin: $B" -d "$2"; }
py()   { python3 -c "import sys,json; d=json.load(sys.stdin); $1"; }
# Everything React sends the browser as data rides in <script> blocks, and that includes whole
# component trees the page never draws. Strip them and what is left is the markup a person sees,
# which is the only thing a "this must not be on the screen" check should be asking about.
# React also drops an empty <!-- --> between adjacent text parts ("Code printed <!-- -->today"),
# which a person never sees either, so those go too and a phrase reads as it renders.
markup(){ python3 -c 'import sys,re; sys.stdout.write(re.sub(r"<!-- -->","",re.sub(r"(?is)<script\b[^>]*>.*?</script>","",sys.stdin.read())))'; }

TS=$(date +%s)
CO="ss$TS@example.com"
ME="wearer$TS@example.com"

echo "== setup"
check "coordinator signs up" "$(curl -s -c "$C" -X POST "$B/api/auth/signup" -H 'content-type: application/json' \
  -H "x-forwarded-for: 10.23.$((RANDOM%250)).$((RANDOM%250))" \
  -d "{\"first\":\"Sam\",\"last\":\"Self\",\"facility\":\"Self Service Hospital $TS\",\"email\":\"$CO\",\"password\":\"password123\"}")" '"ok":true'
check "the facility names its staff groups" "$(e2e_groups "$B" "$C")" '"ok":true'

A=$(mut staff.save "{\"num\":\"SS1\",\"first\":\"Ada\",\"last\":\"Wearer\",\"group\":\"Support Services\",\"dept\":\"Theatres\",\"top\":\"M\",\"pants\":\"12\"}")
check "a staff member exists" "$A" '"id"'
AID=$(echo "$A" | py "print(d['result']['id'])")
Bx=$(mut staff.save "{\"num\":\"SS2\",\"first\":\"Bo\",\"last\":\"Other\",\"group\":\"Security\",\"dept\":\"Front of house\"}")
BID=$(echo "$Bx" | py "print(d['result']['id'])")
check "and a second one" "$Bx" '"id"'

# Give Ada something to look at, so the view has content and the isolation check has a needle.
ITEM=$(mut catalog.add '{"item":"Theatre scrub top","type":"Scrub top","sizes":["S","M","L"],"cost":24.5,"opening":[{"si":1,"qty":40}]}')
check "a garment is on the shelf" "$ITEM" '"id"'
IID=$(echo "$ITEM" | py "print(d['result']['id'])")
# The quantity is what is asserted, not just that it worked: every count in the handed-back
# section below is arithmetic over this two, so a change to it has to fail here rather than
# quietly rewrite what those later checks mean.
check "Ada is issued two" "$(mut issue.create "{\"staffId\":\"$AID\",\"lines\":[{\"itemId\":\"$IID\",\"si\":1,\"qty\":2}]}")" '"stock":2'

echo "== the code"
GEN=$(mut staff.selfCode "{\"id\":\"$AID\"}")
check "a coordinator can generate one" "$GEN" '"code"'
CODE=$(echo "$GEN" | py "print(d['result']['code'])")
check "twelve characters in three groups" "$CODE" '^[2-9A-HJ-NP-Z]\{4\}-[2-9A-HJ-NP-Z]\{4\}-[2-9A-HJ-NP-Z]\{4\}$'
no "with no ambiguous characters" "$CODE" '[ILOU01]'
# The snapshot is server-rendered into the page rather than served from an endpoint, so the staff
# record itself is where to look for what the coordinator's browser was told.
# The redesign moved the staff-app panel to the record's "Details & access" tab and shortened its
# line; "Code printed today, unused" only renders while a live, unused code is on the record.
REC=$(curl -s -b "$C" "$B/app/staff/$AID?tab=details")
check "the record says a code is outstanding" "$(echo "$REC" | markup)" 'Code printed today, unused'
no "but the page never carries the code itself" "$REC" "$CODE"

echo "== activating"
check "a wrong code is refused" "$(spost /api/staff/activate "{\"agreed\":true,\"code\":\"AAAA-BBBB-CCCC\",\"email\":\"x$ME\",\"password\":\"wearerpass1\"}")" "isn't right"
check "a short password is refused" "$(spost /api/staff/activate "{\"agreed\":true,\"code\":\"$CODE\",\"email\":\"$ME\",\"password\":\"short\"}")" 'at least 8'
check "a bad email is refused" "$(spost /api/staff/activate "{\"agreed\":true,\"code\":\"$CODE\",\"email\":\"notanemail\",\"password\":\"wearerpass1\"}")" 'email address'
ACT=$(spost /api/staff/activate "{\"agreed\":true,\"code\":\"$CODE\",\"email\":\"$ME\",\"password\":\"wearerpass1\"}")
check "the right code sets the account up" "$ACT" '"ok":true'
check "and greets them by name" "$ACT" 'Ada Wearer'
check "a staff cookie was set" "$(cat "$S")" 'tc_staff'
check "the same code can't be used twice" "$(curl -s -X POST "$B/api/staff/activate" -H 'content-type: application/json' -H "origin: $B" -d "{\"agreed\":true,\"code\":\"$CODE\",\"email\":\"second$ME\",\"password\":\"wearerpass1\"}")" 'already been used'

echo "== what they see"
MY=$(curl -s -b "$S" "$B/my")
check "their own name on home" "$MY" 'Ada Wearer'
check "their ward and staff number" "$MY" 'Theatres · SS1'
no "and nobody else on the register" "$MY" 'Bo Other'
KIT=$(curl -s -b "$S" "$B/my/kit")
check "the kit screen lists what they hold" "$KIT" 'Theatre scrub top'
no "and still nobody else" "$KIT" 'Bo Other'
check "and nothing has come back off the record yet" "$KIT" 'Nothing handed back since'
# Their recorded sizes used to be checked on Home. They were taken off that screen — homeData does
# not return them any more — but they were not taken away from the person: the Kit screen carries
# them, so the check follows them here rather than disappearing. This is not a duplicate of
# anything above. Kit keeps the sizes behind its "My sizes" tab, and which tab is showing is
# decided in the browser, so the server sends them as the screen's data rather than as markup.
# That is what curl can see of them, and it is what the tab draws from: the two sizes Ada was
# saved with at the top of this file, spelled the way the screen was handed them.
check "  and their recorded top and trouser sizes" "$KIT" '\\"sizes\\":{\\"top\\":\\"M\\",\\"pants\\":\\"12\\"}'

echo "== handed back counts both ways a garment leaves a person"
# Two things take a garment off somebody: a return over the counter, and a hand-in, which never
# stamps returnedDate because the garment joins the pre-loved pool instead of coming back to the
# shelf. Counting returns alone told somebody who had carried four garments in that morning that
# they had handed nothing back all year — on the one screen they would check before arguing about
# it. A write-off is neither: nobody handed that one back, and crediting them for it is the same
# untruth in the other direction.
check "Ada is issued three more" "$(mut issue.create "{\"staffId\":\"$AID\",\"lines\":[{\"itemId\":\"$IID\",\"si\":1,\"qty\":3}]}")" '"stock":3'
ISS=$(curl -s -b "$C" "$B/api/backup" | py "print([i['id'] for i in d['issues'] if i['staffId']=='$AID'][0])")
check "one comes back over the counter" "$(mut issue.return "{\"id\":\"$ISS\",\"qty\":1,\"cond\":\"Returned - Good\"}")" '"ok":true'
check "the kit screen counts it" "$(curl -s -b "$S" "$B/my/kit")" '1 garment handed back since'
check "another is handed in to the pool" "$(mut handin.add "{\"staffId\":\"$AID\",\"lines\":[{\"itemId\":\"$IID\",\"si\":1,\"qty\":1,\"cond\":\"Good\"}]}")" '"good":1'
check "  and it counts the same" "$(curl -s -b "$S" "$B/my/kit")" '2 garments handed back since'
LOST=$(curl -s -b "$C" "$B/api/backup" | py "print([i['id'] for i in d['issues'] if i['staffId']=='$AID' and not i['returnedDate'] and not i['handedIn']][0])")
check "one more is written off" "$(mut issue.return "{\"id\":\"$LOST\",\"qty\":1,\"cond\":\"Written Off\"}")" '"ok":true'
check "  which nobody handed back" "$(curl -s -b "$S" "$B/my/kit")" '2 garments handed back since'

echo "== leaving the app"
HOME_HTML=$(curl -s -b "$S" "$B/my")
check "Home offers a way out" "$HOME_HTML" 'Sign out'
# Asked of the markup, because the whole response is not the screen. The site's 404 page carries
# the marketing nav, "Log in — /auth" and all, and Next serialises that boundary into the payload
# of every page under the root layout, this one included. Nothing draws it unless a route calls
# notFound(), so grepping the raw HTML found the coordinator's door in a tree the wearer never
# sees. What is left after the scripts go is what is on the screen, and the bare path catches the
# link however it is written — absolute or not, an href or a form.
HOME_MARKUP=$(printf '%s' "$HOME_HTML" | markup)
no "and never sends a wearer to the desktop sign-in" "$HOME_MARKUP" '/auth'
LOGOUT_JAR="$T/tc-ss-out.txt"; cp "$S" "$LOGOUT_JAR"
check "signing out is accepted" "$(curl -s -b "$LOGOUT_JAR" -c "$LOGOUT_JAR" -X POST "$B/api/staff/logout" -H 'content-type: application/json' -H "origin: $B" -d '{}')" '"ok":true'
check "and the session is dead afterwards" "$(curl -s -o /dev/null -w '%{http_code} %{redirect_url}' -b "$LOGOUT_JAR" "$B/my")" '30[0-9] .*/my/signin'
# The "On the website" list — the coordinator's sign-in among it — was removed from this screen at
# Kyle's ask (2026-09-12): nothing on it was something a wearer could act on here. The terms and
# the policy now travel with the agreement tick instead.
no    "the sign-in no longer points coordinators at the website" "$(curl -s "$B/my/signin")" 'href="https://threadcount.tech/auth"'
check "  but the agreement tick links the terms" "$(curl -s "$B/my/signin")" '/terms'


echo "== a staff session is not a coordinator session"
check "/app redirects to the coordinator sign-in" "$(curl -s -o /dev/null -w '%{http_code} %{redirect_url}' -b "$S" "$B/app")" '30[0-9] .*/auth'
check "/m redirects too" "$(curl -s -o /dev/null -w '%{http_code} %{redirect_url}' -b "$S" "$B/m")" '30[0-9] .*/m/login'
check "the backup export is refused" "$(curl -s -b "$S" "$B/api/backup")" 'Not signed in'
check "so is any mutation" "$(curl -s -b "$S" -X POST "$B/api/mutate" -H 'content-type: application/json' -H "origin: $B" -d '{"op":"staff.delete","payload":{"id":"x"}}')" 'Not signed in'
check "and the audit log" "$(curl -s -b "$S" "$B/api/activity")" 'Not signed in'

echo "== the staff token is not a session token"
TOK=$(grep tc_staff "$S" | awk '{print $NF}')
check "a token was captured for the test" "$TOK" '.'
check "presented as tc_session it authenticates nothing" "$(curl -s -H "cookie: tc_session=$TOK" "$B/api/backup")" 'Not signed in'

echo "== a coordinator is not a staff member either"
check "/my sends a coordinator to the staff sign-in" "$(curl -s -o /dev/null -w '%{http_code} %{redirect_url}' -b "$C" "$B/my")" '30[0-9] .*/my/signin'

echo "== signing in again"
check "the password signs them in" "$(curl -s -c "$S" -X POST "$B/api/staff/login" -H 'content-type: application/json' -H "origin: $B" -d "{\"email\":\"$ME\",\"password\":\"wearerpass1\"}")" '"ok":true'
check "a wrong password does not" "$(curl -s -X POST "$B/api/staff/login" -H 'content-type: application/json' -H "origin: $B" -d "{\"email\":\"$ME\",\"password\":\"nope\"}")" 'doesn’t match'
check "an unknown address does not" "$(curl -s -X POST "$B/api/staff/login" -H 'content-type: application/json' -H "origin: $B" -d '{"email":"nobody@example.com","password":"whatever"}')" 'doesn’t match'
check "a coordinator's own password does not open a staff account" "$(curl -s -X POST "$B/api/staff/login" -H 'content-type: application/json' -H "origin: $B" -d "{\"email\":\"$CO\",\"password\":\"password123\"}")" 'doesn’t match'

echo "== one wearer cannot become another"
CODE2=$(mut staff.selfCode "{\"id\":\"$BID\"}" | py "print(d['result']['code'])")
check "Bo activates their own" "$(curl -s -c "$S2" -X POST "$B/api/staff/activate" -H 'content-type: application/json' -H "origin: $B" -d "{\"agreed\":true,\"code\":\"$CODE2\",\"email\":\"bo$ME\",\"password\":\"wearerpass2\"}")" '"ok":true'
MY2=$(curl -s -b "$S2" "$B/my")
check "and sees themselves" "$MY2" 'Bo Other'
no "not Ada" "$MY2" 'Ada Wearer'
no "and not Ada's garments" "$(curl -s -b "$S2" "$B/my/kit")" 'Theatre scrub top'

echo "== and cannot raise a request in anybody else’s name"
# The one door into somebody else's name is being their manager — the ward desk had one too, and
# lost it. Ada manages nobody, so the answer she gets is the answer everybody else gets.
FOR_BO=$(spost /api/staff/mutate "{\"op\":\"request.create\",\"payload\":{\"subjectId\":\"$BID\",\"lines\":[{\"itemId\":\"$IID\",\"si\":1,\"qty\":1}]}}")
check "raising for somebody else is refused" "$FOR_BO" "Only somebody.s own manager"
no "  and nothing is created by it" "$FOR_BO" '"code"'
check "and with no approver they cannot raise for themselves either" "$(spost /api/staff/mutate "{\"op\":\"request.create\",\"payload\":{\"lines\":[{\"itemId\":\"$IID\",\"si\":1,\"qty\":1}]}}")" "manager isn't set"

echo "== the coordinator side afterwards"
check "the record shows the linked address" "$(curl -s -b "$C" "$B/app/staff/$AID?tab=details" | markup)" "$ME"
check "a second code is refused while they are linked" "$(mut staff.selfCode "{\"id\":\"$AID\"}")" 'already has an account'

echo "== taking access away"
check "unlink works" "$(mut staff.selfUnlink "{\"id\":\"$AID\"}")" '"ok":true'
check "their session dies with it" "$(curl -s -o /dev/null -w '%{http_code} %{redirect_url}' -b "$S" "$B/my")" '30[0-9] .*/my/signin'
check "and the password no longer signs in" "$(curl -s -X POST "$B/api/staff/login" -H 'content-type: application/json' -H "origin: $B" -d "{\"email\":\"$ME\",\"password\":\"wearerpass1\"}")" 'doesn’t match'

echo "== leaving the register ends the view"
check "Bo is deactivated" "$(mut staff.patch "{\"id\":\"$BID\",\"inactive\":true}")" '"ok":true'
check "and can no longer see their record" "$(curl -s -o /dev/null -w '%{http_code} %{redirect_url}' -b "$S2" "$B/my")" '30[0-9] .*/my/signin'
check "nor sign in again" "$(curl -s -X POST "$B/api/staff/login" -H 'content-type: application/json' -H "origin: $B" -d "{\"email\":\"bo$ME\",\"password\":\"wearerpass2\"}")" 'no longer on the register'

echo "== cross-site requests are refused"
# A gate can only be seen working on a request that would otherwise have gone through. These pairs
# send the very same body twice, and the Origin header is the only thing that differs between the
# two, so nothing but the origin check can account for one being refused and the other landing.
# Sent with a spent code or an unlinked account, as this section used to be, a refusal proves
# nothing: the request was going to fail whichever origin it came from.
CX=$(mut staff.save "{\"num\":\"SS3\",\"first\":\"Cass\",\"last\":\"Third\",\"group\":\"Security\",\"dept\":\"Front of house\"}")
check "a third wearer to try it on" "$CX" '"id"'
CXID=$(echo "$CX" | py "print(d['result']['id'])")
CODE3=$(mut staff.selfCode "{\"id\":\"$CXID\"}" | py "print(d['result']['code'])")
CXEMAIL="cass$ME"
CXBODY="{\"agreed\":true,\"code\":\"$CODE3\",\"email\":\"$CXEMAIL\",\"password\":\"wearerpass3\"}"
check "a good activation from another origin is refused" "$(curl -s -X POST "$B/api/staff/activate" -H 'content-type: application/json' -H "origin: https://evil.example" -d "$CXBODY")" 'Cross-site request refused'
# Landing now also says the refused attempt never spent the code on its way out.
check "  and the same one from our own origin is accepted" "$(curl -s -X POST "$B/api/staff/activate" -H 'content-type: application/json' -H "origin: $B" -d "$CXBODY")" '"ok":true'
CXLOGIN="{\"email\":\"$CXEMAIL\",\"password\":\"wearerpass3\"}"
check "a good sign-in from another origin is refused" "$(curl -s -X POST "$B/api/staff/login" -H 'content-type: application/json' -H "origin: https://evil.example" -d "$CXLOGIN")" 'Cross-site request refused'
check "  and the same one from our own origin signs them in" "$(curl -s -X POST "$B/api/staff/login" -H 'content-type: application/json' -H "origin: $B" -d "$CXLOGIN")" '"ok":true'
# Origin is only half the gate. A cross-site form post may carry no Origin at all, but the browser
# still stamps Sec-Fetch-Site on it, and a form can only ever send a non-JSON content type.
check "a cross-site post the browser labelled as such is refused" "$(curl -s -X POST "$B/api/staff/login" -H 'content-type: application/json' -H 'sec-fetch-site: cross-site' -d "$CXLOGIN")" 'Cross-site request refused'
check "and a form post from our own origin gets no further" "$(curl -s -X POST "$B/api/staff/login" -H 'content-type: text/plain' -H "origin: $B" -d "$CXLOGIN")" 'Expected JSON'

echo "== the sign-in page itself"
SI=$(curl -s "$B/my/signin")
# Being public is the status code. "Your uniform record" is the <title> the whole /my shell sets,
# so grepping the body for it proved nothing about this page — it would come back 200 with the
# Suspense fallback and no form at all and still look green.
check "is public" "$(curl -s -o /dev/null -w '%{http_code}' "$B/my/signin")" '^200$'
check "offers both ways in" "$SI" 'I have a code'
check "and points coordinators elsewhere" "$SI" '/auth'

echo; echo "PASS=$PASS FAIL=$FAIL"; [ "$FAIL" -eq 0 ]
