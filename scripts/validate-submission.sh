#!/usr/bin/env bash

set -euo pipefail

SPACE_URL="${1:-}"
REPO_DIR="${2:-.}"
DOCKER_TIMEOUT_SEC="${DOCKER_TIMEOUT_SEC:-600}"

if [ -z "$SPACE_URL" ]; then
  echo "Usage: $0 <space_url> [repo_dir]"
  echo "Example: $0 https://your-space.hf.space ."
  exit 1
fi

SPACE_URL="${SPACE_URL%/}"
REPO_DIR="$(cd "$REPO_DIR" && pwd)"

if [ -t 1 ]; then
  GREEN='\033[0;32m'
  RED='\033[0;31m'
  YELLOW='\033[1;33m'
  NC='\033[0m'
else
  GREEN=''
  RED=''
  YELLOW=''
  NC=''
fi

say() { echo "[$(date -u +%H:%M:%S)] $*"; }
pass() { say "${GREEN}PASS${NC} - $*"; }
fail() { say "${RED}FAIL${NC} - $*"; exit 1; }
warn() { say "${YELLOW}WARN${NC} - $*"; }

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || fail "Missing required command: $1"
}

run_timeout() {
  local secs="$1"; shift
  if command -v timeout >/dev/null 2>&1; then
    timeout "$secs" "$@"
  elif command -v gtimeout >/dev/null 2>&1; then
    gtimeout "$secs" "$@"
  else
    "$@"
  fi
}

validate_log_format() {
  local file="$1"
  python - "$file" <<'PY'
import re
import sys

path = sys.argv[1]
with open(path, "r", encoding="utf-8", errors="replace") as fh:
    lines = [ln.rstrip("\n") for ln in fh]

start_lines = [ln for ln in lines if ln.startswith("[START] ")]
step_lines = [ln for ln in lines if ln.startswith("[STEP] ")]
end_lines = [ln for ln in lines if ln.startswith("[END] ")]

if not start_lines:
    raise SystemExit("Missing [START] line")
if not step_lines:
    raise SystemExit("Missing [STEP] line")
if not end_lines:
    raise SystemExit("Missing [END] line")

step_re = re.compile(r"^\[STEP\] step=\d+ action=.* reward=-?\d+\.\d{2} done=(true|false) error=.*$")
for line in step_lines:
    if not step_re.match(line):
        raise SystemExit(f"Invalid [STEP] format: {line}")

end_re = re.compile(r"^\[END\] success=(true|false) steps=\d+ score=([-+]?\d+(?:\.\d+)?) rewards=.*$")
for line in end_lines:
    m = end_re.match(line)
    if not m:
        raise SystemExit(f"Invalid [END] format: {line}")
    score = float(m.group(2))
    if score < 0.0 or score > 1.0:
        raise SystemExit(f"Score out of range [0,1]: {score}")

print("ok")
PY
}

say "Repo: $REPO_DIR"
say "Space: $SPACE_URL"

need_cmd curl
need_cmd docker
need_cmd openenv
need_cmd python

# 0) static file checks
[ -f "$REPO_DIR/inference.py" ] || fail "inference.py missing at repo root"
[ -f "$REPO_DIR/openenv.yaml" ] || fail "openenv.yaml missing at repo root"
if [ -f "$REPO_DIR/Dockerfile" ]; then
  DOCKER_CONTEXT="$REPO_DIR"
elif [ -f "$REPO_DIR/server/Dockerfile" ]; then
  DOCKER_CONTEXT="$REPO_DIR/server"
else
  fail "Dockerfile not found in repo root or server/"
fi
pass "Required files present"

# 1) ping remote reset endpoint
say "Checking HF Space reset endpoint"
HTTP_CODE=$(curl -sS -o /tmp/openenv-reset.out -w "%{http_code}" -X POST \
  -H "Content-Type: application/json" \
  -d '{"scenario":"log_analysis"}' \
  "$SPACE_URL/api/v1/env/reset" || echo "000")

if [ "$HTTP_CODE" = "200" ]; then
  pass "Space responds to /api/v1/env/reset"
else
  HTTP_CODE_FALLBACK=$(curl -sS -o /tmp/openenv-reset.out -w "%{http_code}" -X POST \
    -H "Content-Type: application/json" \
    -d '{}' \
    "$SPACE_URL/reset" || echo "000")
  [ "$HTTP_CODE_FALLBACK" = "200" ] || fail "Space reset endpoint failed (codes: /api/v1/env/reset=$HTTP_CODE, /reset=$HTTP_CODE_FALLBACK)"
  pass "Space responds to /reset"
fi

# 2) docker build
say "Building Docker image"
if run_timeout "$DOCKER_TIMEOUT_SEC" docker build "$DOCKER_CONTEXT" >/tmp/openenv-docker.out 2>&1; then
  pass "Docker build successful"
else
  tail -n 40 /tmp/openenv-docker.out || true
  fail "Docker build failed"
fi

# 3) openenv validate
say "Running openenv validate"
if (cd "$REPO_DIR" && openenv validate >/tmp/openenv-validate.out 2>&1); then
  pass "openenv validate passed"
else
  cat /tmp/openenv-validate.out || true
  fail "openenv validate failed"
fi

# 4) inference contract check
say "Running local inference contract check"
: "${API_BASE_URL:?Set API_BASE_URL before running this script}"
: "${MODEL_NAME:?Set MODEL_NAME before running this script}"
: "${HF_TOKEN:?Set HF_TOKEN before running this script}"

if (cd "$REPO_DIR" && python inference.py --task log_analysis >/tmp/openenv-inference.out 2>&1); then
  validate_log_format /tmp/openenv-inference.out
  pass "inference.py executes and emits valid START/STEP/END lines"
else
  cat /tmp/openenv-inference.out || true
  fail "inference.py execution failed"
fi

say "All checks passed. Submission is pre-validated."
