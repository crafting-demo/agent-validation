#!/usr/bin/env bash
#
# Agent Launcher — creates N agent-runtime sandboxes, runs the customer support
# simulation + grading in each, collects results, and reports aggregate scores.
#
# Usage:
#   bash agent-launcher/launch.sh [NUM_SANDBOXES] [TIMEOUT_SECONDS]
#
# Defaults: 2 sandboxes, 600s timeout
set -euo pipefail

NUM_SANDBOXES="${1:-2}"
TIMEOUT="${2:-600}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"
RUNTIME_DIR="$REPO_ROOT/agent-runtime"
RESULTS_DIR="$REPO_ROOT/agent-launcher/results"

mkdir -p "$RESULTS_DIR"

# Generate sandbox names
SANDBOXES=()
for i in $(seq 1 "$NUM_SANDBOXES"); do
  SUFFIX=$(head -c 100 /dev/urandom | tr -dc 'a-z0-9' | head -c 4)
  SANDBOXES+=("ar-${SUFFIX}")
done

echo "============================================"
echo "  Agent Validation Launcher"
echo "============================================"
echo "Sandboxes to create: $NUM_SANDBOXES"
echo "Timeout per sandbox: ${TIMEOUT}s"
echo "Sandbox names: ${SANDBOXES[*]}"
echo ""

# --- Phase 1: Create sandboxes in parallel ---
echo "=== Phase 1: Creating sandboxes ==="
PIDS_CREATE=()
for NAME in "${SANDBOXES[@]}"; do
  echo "  Creating $NAME ..."
  cs sb create "$NAME" --from "def:${RUNTIME_DIR}/sandbox.yaml" --wait --wait-timeout 300s 2>&1 | tail -1 &
  PIDS_CREATE+=($!)
done

# Wait for all creations
FAILED_CREATE=()
for i in "${!PIDS_CREATE[@]}"; do
  if ! wait "${PIDS_CREATE[$i]}"; then
    echo "  FAILED to create ${SANDBOXES[$i]}"
    FAILED_CREATE+=("${SANDBOXES[$i]}")
  else
    echo "  ${SANDBOXES[$i]} is ready"
  fi
done

# Remove failed sandboxes from the list
ACTIVE_SANDBOXES=()
for NAME in "${SANDBOXES[@]}"; do
  SKIP=false
  for F in "${FAILED_CREATE[@]+"${FAILED_CREATE[@]}"}"; do
    if [ "$NAME" = "$F" ]; then SKIP=true; break; fi
  done
  if [ "$SKIP" = false ]; then ACTIVE_SANDBOXES+=("$NAME"); fi
done

if [ ${#ACTIVE_SANDBOXES[@]} -eq 0 ]; then
  echo "ERROR: No sandboxes were created successfully."
  exit 1
fi
echo ""

# --- Phase 2: Deploy code and run bootstrap ---
echo "=== Phase 2: Deploying code and running tests ==="

# Package the agent-runtime code
TARBALL="/tmp/agent-runtime-deploy.tar.gz"
(cd "$REPO_ROOT" && tar czf "$TARBALL" agent-runtime/)

PIDS_RUN=()
LOG_FILES=()
for NAME in "${ACTIVE_SANDBOXES[@]}"; do
  LOG_FILE="/tmp/${NAME}.log"
  LOG_FILES+=("$LOG_FILE")
  (
    echo "[${NAME}] Deploying code..."
    # Copy tarball to the sandbox
    cs scp "$TARBALL" "${NAME}/app:~/agent-runtime-deploy.tar.gz"

    # Extract and set up
    cs exec -W "${NAME}/app" -- bash -c 'cd /home/owner && tar xzf agent-runtime-deploy.tar.gz && rm agent-runtime-deploy.tar.gz && chown -R owner:owner agent-runtime'

    # Also install deps and start API on the api workspace
    cs exec -W "${NAME}/api" -w /home/owner -- bash -c 'mkdir -p ecommerce-api'
    cs scp "$TARBALL" "${NAME}/api:~/api-deploy.tar.gz"
    cs exec -W "${NAME}/api" -- bash -c 'cd /home/owner && tar xzf api-deploy.tar.gz --strip-components=1 --include="agent-runtime/ecommerce-api/*" -C . && mv agent-runtime/ecommerce-api/* ecommerce-api/ && rm -rf agent-runtime api-deploy.tar.gz'
    cs exec -W "${NAME}/api" -w /home/owner/ecommerce-api -- bun install

    # Create the database
    for attempt in $(seq 1 30); do
      if cs exec -W "${NAME}/app" -- mysql -h mysql -u root -prootpass --skip-ssl -e "SELECT 1" >/dev/null 2>&1; then
        break
      fi
      sleep 2
    done
    cs exec -W "${NAME}/app" -- mysql -h mysql -u root -prootpass --skip-ssl -e "CREATE DATABASE IF NOT EXISTS ecommerce_db; GRANT ALL PRIVILEGES ON ecommerce_db.* TO 'ecommerce'@'%'; FLUSH PRIVILEGES;" 2>/dev/null

    # Start the API server on the api workspace
    cs exec -W "${NAME}/api" -w /home/owner/ecommerce-api -- bash -c 'bun run src/index.ts > /tmp/api.log 2>&1 &'
    sleep 3

    # Wait for API on the app workspace
    for attempt in $(seq 1 20); do
      if cs exec -W "${NAME}/app" -- curl -s http://api:3000/health >/dev/null 2>&1; then
        echo "[${NAME}] API is ready"
        break
      fi
      sleep 2
    done

    # Install Claude CLI on the app workspace
    echo "[${NAME}] Installing Claude CLI..."
    cs exec -W "${NAME}/app" -- bash -c 'bun install -g @anthropic-ai/claude-code 2>&1 && ln -sf /usr/local/bin/bun /root/.bun/bin/node 2>/dev/null || true'

    # Install MCP deps
    echo "[${NAME}] Installing MCP dependencies..."
    cs exec -W "${NAME}/app" -w /home/owner/agent-runtime/ecommerce-mcp -- bun install
    cs exec -W "${NAME}/app" -w /home/owner/agent-runtime/customer-support-agent-mcp -- bun install

    # Configure Claude MCP for the owner user
    cs exec -W "${NAME}/app" --uid 1000 -- bash -c 'export PATH="/root/.bun/bin:$PATH" HOME=/home/owner && claude mcp add customer-support-agent -- bun run /home/owner/agent-runtime/customer-support-agent-mcp/src/index.ts'

    # Run the simulation
    echo "[${NAME}] Running simulation..."
    cs exec -W "${NAME}/app" --uid 1000 -w / -- bash -c 'export PATH="/root/.bun/bin:$PATH" HOME=/home/owner && cat /home/owner/agent-runtime/prompts/meta-agent-customer-simulation.md | claude -p --dangerously-skip-permissions --model sonnet --allowedTools mcp__customer-support-agent__support_chat' > /dev/null 2>&1

    # Find the session log and run the grader
    echo "[${NAME}] Grading..."
    SESSION_ID=$(cs exec -W "${NAME}/app" --uid 1000 -- bash -c 'cat /home/owner/.customer-support-sessions.json' | python3 -c "import json,sys; d=json.load(sys.stdin); print(list(d.values())[0])" 2>/dev/null)
    SESSION_LOG="/home/owner/.claude/projects/-/${SESSION_ID}.jsonl"

    cs exec -W "${NAME}/app" --uid 1000 -w / -- bash -c "export PATH=/root/.bun/bin:\$PATH HOME=/home/owner && bun run /home/owner/agent-runtime/scripts/grade-session.ts $SESSION_LOG /home/owner/agent-runtime/customer_support-output_grade.json" > /dev/null 2>&1

    echo "[${NAME}] Done! Copying grade..."
  ) > "$LOG_FILE" 2>&1 &
  PIDS_RUN+=($!)
done

# --- Phase 3: Wait for completion with timeout ---
echo "=== Phase 3: Waiting for completion (timeout: ${TIMEOUT}s) ==="
START_TIME=$(date +%s)
COMPLETED=()
TIMED_OUT=()

while true; do
  ALL_DONE=true
  for i in "${!PIDS_RUN[@]}"; do
    NAME="${ACTIVE_SANDBOXES[$i]}"
    PID="${PIDS_RUN[$i]}"

    # Skip already completed
    for C in "${COMPLETED[@]+"${COMPLETED[@]}"}" "${TIMED_OUT[@]+"${TIMED_OUT[@]}"}"; do
      if [ "$NAME" = "$C" ]; then continue 2; fi
    done

    if ! kill -0 "$PID" 2>/dev/null; then
      # Process finished
      if wait "$PID"; then
        echo "  ✅ $NAME completed"
        COMPLETED+=("$NAME")
      else
        echo "  ❌ $NAME failed (see /tmp/${NAME}.log)"
        COMPLETED+=("$NAME")
      fi
    else
      ALL_DONE=false
    fi
  done

  if $ALL_DONE; then break; fi

  ELAPSED=$(( $(date +%s) - START_TIME ))
  if [ "$ELAPSED" -ge "$TIMEOUT" ]; then
    echo "  ⏰ Timeout reached!"
    for i in "${!PIDS_RUN[@]}"; do
      NAME="${ACTIVE_SANDBOXES[$i]}"
      PID="${PIDS_RUN[$i]}"
      FOUND=false
      for C in "${COMPLETED[@]+"${COMPLETED[@]}"}"; do
        if [ "$NAME" = "$C" ]; then FOUND=true; break; fi
      done
      if [ "$FOUND" = false ]; then
        kill "$PID" 2>/dev/null || true
        echo "  ⏰ $NAME timed out"
        TIMED_OUT+=("$NAME")
      fi
    done
    break
  fi

  sleep 5
done
echo ""

# --- Phase 4: Collect grades ---
echo "=== Phase 4: Collecting grades ==="
GRADE_FILES=()
for NAME in "${COMPLETED[@]}"; do
  GRADE_DEST="${RESULTS_DIR}/${NAME}.grade.json"
  if cs scp "${NAME}/app:~/agent-runtime/customer_support-output_grade.json" "$GRADE_DEST" 2>/dev/null; then
    echo "  📋 $NAME → $GRADE_DEST"
    GRADE_FILES+=("$GRADE_DEST")
  else
    echo "  ⚠️  $NAME — no grade file found"
  fi
done
echo ""

# --- Phase 5: Delete sandboxes ---
echo "=== Phase 5: Cleaning up sandboxes ==="
for NAME in "${ACTIVE_SANDBOXES[@]}"; do
  echo "  Deleting $NAME ..."
  cs sb remove "$NAME" --force 2>/dev/null &
done
wait
echo ""

# --- Phase 6: Aggregate results ---
echo "============================================"
echo "  Test Results"
echo "============================================"

if [ ${#GRADE_FILES[@]} -eq 0 ]; then
  echo "No grades collected. Check logs in /tmp/ar-*.log"
  exit 1
fi

# Use python3 to aggregate the JSON grade files
python3 -c "
import json, sys, os

files = sys.argv[1:]
results = []
for f in files:
    try:
        with open(f) as fh:
            data = json.load(fh)
            data['sandbox'] = os.path.basename(f).replace('.grade.json', '')
            results.append(data)
    except Exception as e:
        print(f'  Warning: could not read {f}: {e}', file=sys.stderr)

if not results:
    print('No valid grade files found.')
    sys.exit(1)

# Print individual results
for r in results:
    sb = r.get('sandbox', '?')
    score = r.get('weighted_score', 0)
    summary = r.get('summary', 'N/A')
    print(f'  {sb}: {score}/100')
    criteria = r.get('criteria', {})
    for name, info in criteria.items():
        print(f'    {name}: {info[\"score\"]}/10 — {info[\"comment\"]}')
    print()

# Compute average
scores = [r.get('weighted_score', 0) for r in results]
avg = sum(scores) / len(scores)

print(f'────────────────────────────────────────────')
print(f'  Sandboxes tested: {len(results)}')
print(f'  Scores: {\" | \".join(str(s) for s in scores)}')
print(f'  Average score: {avg:.1f}/100')
print(f'────────────────────────────────────────────')

# Write aggregate output
aggregate = {
    'num_sandboxes': len(results),
    'scores': scores,
    'average_score': round(avg, 1),
    'individual_results': results,
}
outpath = os.path.join(os.path.dirname(files[0]), 'aggregate-results.json')
with open(outpath, 'w') as fh:
    json.dump(aggregate, fh, indent=2)
    fh.write('\n')
print(f'\n  Aggregate results written to: {outpath}')
" "${GRADE_FILES[@]}"
