#!/usr/bin/env bash
# Shared preflight and setup for the e2e runners. Sourced by each of them, never run on its own.
#
# Every suite in here starts by creating an account or signing one in, and both of those doors are
# behind Cloudflare Turnstile. In production mode the check fails *closed*: with no TURNSTILE_SECRET
# the server refuses to start at all, and if it is running with one but no reachable Cloudflare, the
# auth routes answer "Security check unavailable". Either way a run against `next start` on a box
# with no Cloudflare keys fails on its first line, with an error about a security check rather than
# about the thing being tested — so it is caught here once, with the way out.
#
# The way out is TURNSTILE_OPTIONAL=1 on the *server* being tested. It is a local smoke-test switch
# only; the hosted deploy refuses a secrets file that carries it.
#
# `next dev` needs none of this: outside production verifyTurnstile is advisory and skips.

e2e_preflight() {
  local base=${1:?base url} body
  body=$(curl -s --max-time 10 -X POST "$base/api/auth/login" \
    -H 'content-type: application/json' \
    -d '{"email":"e2e-preflight@example.com","password":"not-a-password"}' 2>/dev/null || true)

  if [ -z "$body" ]; then
    echo "FATAL: nothing answering at $base."
    echo "       Start the server first — \`npm run dev -- -p 3111\`, or \`next start\` with TURNSTILE_OPTIONAL=1."
    exit 1
  fi

  case "$body" in
    *"Security check unavailable"*|*"complete the security check"*)
      echo "FATAL: $base is in production mode and Turnstile is refusing every auth route."
      echo "       Restart that server with TURNSTILE_OPTIONAL=1 (local smoke tests only), or run against \`next dev\`."
      exit 1 ;;
  esac
}

# A facility's staff groups, named the way a coordinator names them on the first day.
#
# A new facility starts with none, and with no group on the FTE table or the starting kit, because any
# list the product shipped would be one employer's job titles handed to every other employer. So a
# suite that signs up and then files somebody under "Registered Nurse" is testing a facility nobody
# has set up, where everybody is on manager approval. Every suite that signs up calls this straight
# afterwards, with its own cookie jar: e2e_groups "$B" "$J".
#
# The names are generic on purpose — no customer's org chart belongs in a test — and they go in through
# settings.update, the op the settings screen saves with, so a change to what that op accepts breaks
# the setup out loud instead of being stepped around. The response is printed for the suite's own
# check() to judge.
e2e_groups() {
  local base=${1:?base url} jar=${2:?cookie jar}
  curl -s -b "$jar" -c "$jar" -X POST "$base/api/mutate" -H 'content-type: application/json' \
    -d '{"op":"settings.update","payload":{"staffGroups":["Registered Nurse","Enrolled Nurse","Support Services","Kitchen","Security"],"nursingGroups":["Registered Nurse","Enrolled Nurse"],"kitGroups":["Support Services"]}}'
}
