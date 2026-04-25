#!/usr/bin/env bash
set -euo pipefail

ERRORS=0

fail() {
  echo "❌ FAIL: $1"
  ((ERRORS++)) || true
}

pass() {
  echo "✅ PASS: $1"
}

# 1. Check .env
if grep -q 'OPENCODE_BASE_URL=https://opencode.ai/zen/go/v1' .env; then
  pass ".env: OPENCODE_BASE_URL is set"
else
  fail ".env: OPENCODE_BASE_URL is missing or incorrect"
fi

if grep -q 'kimi-k2.6' .env; then
  pass ".env: OPENCODE_MODELS contains kimi-k2.6"
else
  fail ".env: OPENCODE_MODELS does not contain kimi-k2.6"
fi

# 2. Check chart/env/prod.yaml
if grep -q 'OPENCODE_BASE_URL: "https://opencode.ai/zen/go/v1"' chart/env/prod.yaml; then
  pass "chart/env/prod.yaml: OPENCODE_BASE_URL is set"
else
  fail "chart/env/prod.yaml: OPENCODE_BASE_URL is missing or incorrect"
fi

if grep -q 'kimi-k2.6' chart/env/prod.yaml; then
  pass "chart/env/prod.yaml: OPENCODE_MODELS contains kimi-k2.6"
else
  fail "chart/env/prod.yaml: OPENCODE_MODELS does not contain kimi-k2.6"
fi

# 3. Check chart/env/dev.yaml
if grep -q 'OPENCODE_BASE_URL: "https://opencode.ai/zen/go/v1"' chart/env/dev.yaml; then
  pass "chart/env/dev.yaml: OPENCODE_BASE_URL is set"
else
  fail "chart/env/dev.yaml: OPENCODE_BASE_URL is missing or incorrect"
fi

if grep -q 'kimi-k2.6' chart/env/dev.yaml; then
  pass "chart/env/dev.yaml: OPENCODE_MODELS contains kimi-k2.6"
else
  fail "chart/env/dev.yaml: OPENCODE_MODELS does not contain kimi-k2.6"
fi

# 4. Check src/lib/server/models.ts for OpenCode auto-registration loop
if grep -q 'Add OpenCode Go models if OPENCODE_MODELS is configured' src/lib/server/models.ts; then
  pass "src/lib/server/models.ts: OpenCode auto-registration comment found"
else
  fail "src/lib/server/models.ts: OpenCode auto-registration comment missing"
fi

if grep -q 'opencodeBaseUrl' src/lib/server/models.ts && grep -q 'opencodeModelsEnv' src/lib/server/models.ts; then
  pass "src/lib/server/models.ts: OpenCode auto-registration variables found"
else
  fail "src/lib/server/models.ts: OpenCode auto-registration variables missing"
fi

if grep -q 'opencodeModelIds.map' src/lib/server/models.ts; then
  pass "src/lib/server/models.ts: OpenCode model mapping loop found"
else
  fail "src/lib/server/models.ts: OpenCode model mapping loop missing"
fi

if grep -q 'provider: "opencode"' src/lib/server/models.ts; then
  pass "src/lib/server/models.ts: OpenCode provider marker found"
else
  fail "src/lib/server/models.ts: OpenCode provider marker missing"
fi

# Summary
echo ""
if [ "$ERRORS" -eq 0 ]; then
  echo "All checks passed."
  exit 0
else
  echo "$ERRORS check(s) failed."
  exit 1
fi
