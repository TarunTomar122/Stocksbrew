#!/usr/bin/env bash
# Run the varnishtest cases against the real backend/vps/web/varnish.vcl.
#   bash backend/vps/web/varnish-tests/run.sh [case.vtc ...]      default: every *.vtc here
# Needs varnishtest (apt install varnish, or brew install varnish). Each case has a line "varnish v1 @VCL@": it is
# replaced with the production VCL whose two backends point at the case's mock server s1, so the cases test the
# file that ships, not a copy.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
VCL="$HERE/../varnish.vcl"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
command -v varnishtest >/dev/null || { echo "varnishtest not found" >&2; exit 1; }
# Both instances -> the mock server; everything else exactly as shipped. A case with a second mock server (s2) gets
# the second instance there instead (vcl.two), to tell the instances apart.
sed -E 's/\.host = "127\.0\.0\.1"; \.port = "300[01]";/.host = "${s1_addr}"; .port = "${s1_port}";/' "$VCL" > "$TMP/vcl"
sed -E -e 's/\.host = "127\.0\.0\.1"; \.port = "3000";/.host = "${s1_addr}"; .port = "${s1_port}";/' \
  -e 's/\.host = "127\.0\.0\.1"; \.port = "3001";/.host = "${s2_addr}"; .port = "${s2_port}";/' "$VCL" > "$TMP/vcl.two"
# Both backends must have been replaced, or a case could reach a real instance on 3000/3001.
[ "$(grep -c 's1_addr' "$TMP/vcl")" = 2 ] && [ "$(grep -c 's1_addr' "$TMP/vcl.two")" = 1 ] && [ "$(grep -c 's2_addr' "$TMP/vcl.two")" = 1 ] \
  || { echo "backend lines in varnish.vcl changed: update run.sh" >&2; exit 1; }
cases=("$@")
[ ${#cases[@]} -gt 0 ] || cases=("$HERE"/*.vtc)
status=0
for case in "${cases[@]}"; do
  out="$TMP/$(basename "$case")"
  python3 - "$case" "$TMP/vcl" "$TMP/vcl.two" "$out" <<'PY'
import re, sys
case, vcl, vcl_two, out = sys.argv[1:]
text = open(case).read()
assert "@VCL@" in text, f"{case}: no @VCL@ line"
source = vcl_two if re.search(r"(?m)^server s2\b", text) else vcl
open(out, "w").write(text.replace("@VCL@", "-vcl {\n" + open(source).read() + "\n}"))
PY
  if varnishtest ${VTEST_FLAGS:--q} "$out"; then echo "ok   $(basename "$case")"; else echo "FAIL $(basename "$case")"; status=1; fi
done
exit $status
