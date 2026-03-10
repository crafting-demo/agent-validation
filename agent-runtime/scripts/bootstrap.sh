#!/usr/bin/env bash
# Bootstrap script for agent-runtime sandboxes.
# Runs on the 'app' workspace to set up everything, execute the test, and grade.
# Expects agent-runtime code to be at /home/owner/agent-runtime/
set -euo pipefail

RUNTIME_DIR="/home/owner/agent-runtime"
GRADE_OUTPUT="$RUNTIME_DIR/customer_support-output_grade.json"

echo "=== [1/7] Installing Claude CLI ==="
bun add -g @anthropic-ai/claude-code 2>&1 || true
export PATH="$HOME/.bun/bin:$PATH"
ln -sf /usr/local/bin/bun "$HOME/.bun/bin/node" 2>/dev/null || ln -sf /usr/local/bin/bun /usr/local/bin/node 2>/dev/null || true
claude --version

echo "=== [2/7] Installing MCP dependencies ==="
cd "$RUNTIME_DIR/ecommerce-mcp" && bun install
cd "$RUNTIME_DIR/customer-support-agent-mcp" && bun install

echo "=== [3/7] Creating MySQL database ==="
# Wait for MySQL to be ready
for i in $(seq 1 30); do
  if mysql -h mysql -u root -prootpass --skip-ssl -e "SELECT 1" >/dev/null 2>&1; then
    echo "MySQL is ready"
    break
  fi
  echo "Waiting for MySQL... ($i/30)"
  sleep 2
done
mysql -h mysql -u root -prootpass --skip-ssl -e "CREATE DATABASE IF NOT EXISTS ecommerce_db; GRANT ALL PRIVILEGES ON ecommerce_db.* TO 'ecommerce'@'%'; FLUSH PRIVILEGES;" 2>/dev/null

echo "=== [4/7] Starting API server ==="
cd "$RUNTIME_DIR/ecommerce-api" && bun install
cd "$RUNTIME_DIR/ecommerce-api" && bun run src/index.ts &
API_PID=$!

# Wait for API to be ready
for i in $(seq 1 30); do
  if curl -s http://api:3000/health >/dev/null 2>&1; then
    echo "API is ready"
    break
  fi
  echo "Waiting for API... ($i/30)"
  sleep 2
done

echo "=== [5/7] Configuring Claude MCP ==="
claude mcp add customer-support-agent -- bun run "$RUNTIME_DIR/customer-support-agent-mcp/src/index.ts"

echo "=== [6/7] Running customer simulation ==="
cat "$RUNTIME_DIR/prompts/meta-agent-customer-simulation.md" \
  | claude -p \
    --dangerously-skip-permissions \
    --model sonnet \
    --allowedTools mcp__customer-support-agent__support_chat \
    2>&1 | tee /tmp/simulation-output.txt

echo ""
echo "=== Simulation complete. Finding session log... ==="

# Find the sub-agent session ID from the session map
SESSION_MAP="$HOME/.customer-support-sessions.json"
if [ ! -f "$SESSION_MAP" ]; then
  echo "ERROR: No session map found at $SESSION_MAP"
  exit 1
fi

SESSION_ID=$(cat "$SESSION_MAP" | python3 -c "import json,sys; d=json.load(sys.stdin); print(list(d.values())[0])" 2>/dev/null || cat "$SESSION_MAP" | bun -e "const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')); console.log(Object.values(d)[0])")
SESSION_LOG="$HOME/.claude/projects/-/${SESSION_ID}.jsonl"

if [ ! -f "$SESSION_LOG" ]; then
  echo "ERROR: Session log not found at $SESSION_LOG"
  exit 1
fi
echo "Session log: $SESSION_LOG ($(wc -l < "$SESSION_LOG") lines)"

echo "=== [7/7] Grading session ==="
bun run "$RUNTIME_DIR/scripts/grade-session.ts" "$SESSION_LOG" "$GRADE_OUTPUT" 2>&1

echo ""
echo "=== DONE ==="
echo "Grade written to: $GRADE_OUTPUT"

# Clean up API server
kill $API_PID 2>/dev/null || true
