#!/data/data/com.termux/files/usr/bin/bash
# ============================================================================
# bench.sh — Benchmark the local Ollama server on your phone
#
# Runs a fixed prompt set from benchmarks/prompts.json against a locally
# running Ollama server (http://localhost:11434 by default). Measures
# per-prompt tok/s from Ollama's eval_count / eval_duration response fields,
# captures cold vs warm runs, and writes a markdown report to
# benchmarks/<device-slug>.md.
#
# The prompt set is fixed on purpose — every benchmark contributed by every
# device owner runs the same prompts so the numbers are comparable across
# phones. The one-file-per-device layout in benchmarks/ lets contributors
# submit a single-file PR with their results and a verification header.
#
# Usage:
#   ./bench.sh                              # use default model (qwen2.5:1.5b)
#   ./bench.sh --model gemma3:1b            # override model
#   ./bench.sh --host http://localhost:11434  # override Ollama host
#   ./bench.sh --output /tmp/bench.md       # override output path
#   ./bench.sh --dry-run                    # print config, don't call Ollama
#   ./bench.sh --runs N                     # repeat each prompt N times (default 1)
#
# Requirements:
#   - Ollama running and reachable at --host (defaults to localhost:11434)
#   - curl (installed by scripts/install-ollama.sh)
#   - python3 (installed by scripts/install-ollama.sh)
#   - The target model already pulled
# ============================================================================

set -euo pipefail

# -- Colors --
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

info()  { echo -e "${CYAN}[INFO]${NC} $*"; }
ok()    { echo -e "${GREEN}[OK]${NC} $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $*"; }
err()   { echo -e "${RED}[ERROR]${NC} $*" >&2; exit 1; }

# -- Resolve paths --
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
BENCHMARKS_DIR="$REPO_DIR/benchmarks"
PROMPTS_FILE="$BENCHMARKS_DIR/prompts.json"

if [ ! -f "$PROMPTS_FILE" ]; then
  err "prompts.json not found at $PROMPTS_FILE. Run from an olladroid checkout."
fi

# -- Default flags --
MODEL="qwen2.5:1.5b"
HOST="http://localhost:11434"
OUTPUT=""
DRY_RUN=false
RUNS=1

while [ $# -gt 0 ]; do
  case "$1" in
    --model)   MODEL="$2"; shift ;;
    --host)    HOST="$2"; shift ;;
    --output)  OUTPUT="$2"; shift ;;
    --dry-run) DRY_RUN=true ;;
    --runs)    RUNS="$2"; shift ;;
    -h|--help)
      sed -n '3,28p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *) err "unknown flag: $1 (try --help)" ;;
  esac
  shift
done

# -- Verify dependencies --
command -v curl >/dev/null 2>&1 || err "curl not found"
command -v python3 >/dev/null 2>&1 || err "python3 not found"

# -- Detect device metadata via getprop (Termux) or uname fallback --
get_device_info() {
  if command -v getprop >/dev/null 2>&1; then
    MANUFACTURER=$(getprop ro.product.manufacturer 2>/dev/null | tr -d '\r' | xargs)
    MODEL_NAME=$(getprop ro.product.model 2>/dev/null | tr -d '\r' | xargs)
    ANDROID_VERSION=$(getprop ro.build.version.release 2>/dev/null | tr -d '\r' | xargs)
    # SoC platform: sm8250 for Snapdragon 865, etc.
    SOC=$(getprop ro.board.platform 2>/dev/null | tr -d '\r' | xargs)
    [ -z "$SOC" ] && SOC=$(getprop ro.soc.model 2>/dev/null | tr -d '\r' | xargs)
    [ -z "$SOC" ] && SOC="unknown-soc"
  else
    MANUFACTURER="$(uname -n | xargs)"
    MODEL_NAME="$(uname -m | xargs)"
    ANDROID_VERSION="$(uname -r | xargs)"
    SOC="unknown-soc"
  fi
  # RAM total from /proc/meminfo (in MiB)
  if [ -r /proc/meminfo ]; then
    RAM_TOTAL_KB=$(grep -m1 "^MemTotal:" /proc/meminfo | awk '{print $2}')
    RAM_TOTAL_MB=$((RAM_TOTAL_KB / 1024))
  else
    RAM_TOTAL_MB=0
  fi
}
get_device_info

# Slug-ify for filename: lowercase, replace non-alnum with -.
# POSIX ERE via `sed -E` so it works on both BSD sed (macOS) and GNU sed.
slugify() {
  echo "$1" | tr '[:upper:]' '[:lower:]' \
    | sed -E 's/[^a-z0-9]+/-/g' \
    | sed -E 's/^-+//; s/-+$//'
}

MANUFACTURER_SLUG=$(slugify "${MANUFACTURER:-unknown}")
MODEL_SLUG=$(slugify "${MODEL_NAME:-unknown}")
SOC_SLUG=$(slugify "${SOC}")
DEVICE_SLUG="${MANUFACTURER_SLUG}-${MODEL_SLUG}-${SOC_SLUG}"

# Include the Ollama model in the filename so benches against multiple
# models on the same device don't overwrite each other. "qwen2.5:1.5b"
# → "qwen2-5-1-5b". Caught during the initial round of benching the three
# README-recommended models on an LG V60.
OLLAMA_MODEL_SLUG=$(slugify "$MODEL")
FILENAME_SLUG="${DEVICE_SLUG}-${OLLAMA_MODEL_SLUG}"

if [ -z "$OUTPUT" ]; then
  OUTPUT="$BENCHMARKS_DIR/$FILENAME_SLUG.md"
fi

# -- Banner --
echo -e "${BOLD}"
echo "  ┌──────────────────────────────────────┐"
echo "  │         OLLADROID BENCH              │"
echo "  └──────────────────────────────────────┘"
echo -e "${NC}"

info "Host:    $HOST"
info "Model:   $MODEL"
info "Device:  $MANUFACTURER $MODEL_NAME (SoC: $SOC, RAM: ${RAM_TOTAL_MB} MiB, Android: $ANDROID_VERSION)"
info "Slug:    $FILENAME_SLUG"
info "Output:  $OUTPUT"
info "Runs:    $RUNS per prompt"
echo ""

if $DRY_RUN; then
  warn "Dry run — not calling Ollama. Exiting."
  exit 0
fi

# -- Verify Ollama is reachable + get its version --
if ! OLLAMA_VERSION_JSON=$(curl -sf --max-time 5 "$HOST/api/version" 2>/dev/null); then
  err "Cannot reach Ollama at $HOST. Start the server with: bash scripts/start-ollama.sh --wifi"
fi
OLLAMA_VERSION=$(echo "$OLLAMA_VERSION_JSON" | python3 -c 'import sys,json; print(json.load(sys.stdin).get("version","unknown"))')
ok "Ollama $OLLAMA_VERSION reachable at $HOST"

# -- Verify the target model is installed --
if ! curl -sf --max-time 5 "$HOST/api/tags" 2>/dev/null | python3 -c "
import sys, json
d = json.load(sys.stdin)
names = [m['name'] for m in d.get('models', [])]
sys.exit(0 if '$MODEL' in names else 1)
"; then
  err "Model '$MODEL' not installed. Pull it with: proot-distro login debian -- ollama pull $MODEL"
fi
ok "Model $MODEL installed"

# -- Unload any loaded models so prompt 1 is a true cold run --
info "Unloading models to force a cold first run"
curl -sf --max-time 5 "$HOST/api/generate" \
  -H 'Content-Type: application/json' \
  -d "{\"model\":\"$MODEL\",\"prompt\":\"\",\"keep_alive\":0}" \
  >/dev/null 2>&1 || true

# -- Parse prompts from prompts.json --
# Emit one line per prompt as: id<TAB>num_predict<TAB>prompt
PROMPTS_TSV=$(python3 -c "
import json, sys
d = json.load(open('$PROMPTS_FILE'))
for p in d['prompts']:
    print(f\"{p['id']}\t{p['num_predict']}\t{p['prompt']}\")
")

PROMPTS_VERSION=$(python3 -c "import json; print(json.load(open('$PROMPTS_FILE'))['version'])")

# -- Run the benchmark --
NUM_PROMPTS=$(echo "$PROMPTS_TSV" | grep -c . || true)
info "Running $NUM_PROMPTS prompts × $RUNS runs each. Cold run is prompt 1, warm is 2+."
echo ""

# Accumulators
RESULTS=()        # One entry per (prompt, run) — "id|run|type|tok|eval_ms|total_ms|tok_per_s"
FIRST=true
PROMPT_INDEX=0

run_one_prompt() {
  local pid="$1" num_predict="$2" prompt_text="$3" run_num="$4" is_cold="$5"

  local body
  body=$(python3 -c "
import json, sys
print(json.dumps({
  'model': '$MODEL',
  'prompt': sys.argv[1],
  'stream': False,
  'options': {'num_predict': int(sys.argv[2])}
}))
" "$prompt_text" "$num_predict")

  local t0 t1 raw
  t0=$(date +%s%3N 2>/dev/null || python3 -c 'import time; print(int(time.time()*1000))')

  if ! raw=$(curl -sf --max-time 300 "$HOST/api/generate" \
    -H 'Content-Type: application/json' \
    -d "$body" 2>/dev/null); then
    printf "  ${RED}✗${NC} %-10s run %d — request failed\n" "$pid" "$run_num"
    RESULTS+=("$pid|$run_num|$is_cold|0|0|0|0")
    return 1
  fi

  t1=$(date +%s%3N 2>/dev/null || python3 -c 'import time; print(int(time.time()*1000))')
  local wall_ms=$((t1 - t0))

  # Parse the response for eval_count and eval_duration (nanoseconds)
  local parsed
  parsed=$(echo "$raw" | python3 -c "
import json, sys
d = json.load(sys.stdin)
eval_count = d.get('eval_count', 0)
eval_duration_ns = d.get('eval_duration', 0)
load_duration_ns = d.get('load_duration', 0)
prompt_eval_count = d.get('prompt_eval_count', 0)
# tok/s from eval only (excludes prompt eval + load)
eval_ms = eval_duration_ns // 1_000_000
load_ms = load_duration_ns // 1_000_000
tps = (eval_count / (eval_duration_ns / 1e9)) if eval_duration_ns > 0 else 0
print(f'{eval_count}|{eval_ms}|{load_ms}|{prompt_eval_count}|{tps:.2f}')
")
  local tok_count eval_ms load_ms _prompt_tokens tps
  IFS='|' read -r tok_count eval_ms load_ms _prompt_tokens tps <<< "$parsed"

  printf "  ${GREEN}✓${NC} %-10s run %d  %3d tok  eval:%5s ms  load:%5s ms  total:%5s ms  ${BOLD}%6.2f tok/s${NC}  [%s]\n" \
    "$pid" "$run_num" "$tok_count" "$eval_ms" "$load_ms" "$wall_ms" "$tps" "$is_cold"

  RESULTS+=("$pid|$run_num|$is_cold|$tok_count|$eval_ms|$wall_ms|$tps")
}

while IFS=$'\t' read -r pid num_predict prompt_text; do
  [ -z "$pid" ] && continue
  PROMPT_INDEX=$((PROMPT_INDEX + 1))
  for run in $(seq 1 "$RUNS"); do
    if $FIRST; then
      IS_COLD="cold"
      FIRST=false
    else
      IS_COLD="warm"
    fi
    run_one_prompt "$pid" "$num_predict" "$prompt_text" "$run" "$IS_COLD" || true
  done
done <<< "$PROMPTS_TSV"

echo ""

# -- Compute aggregate stats via python (easier than pure bash for median) --
STATS_JSON=$(python3 << PYEOF
rows = []
for line in """$(printf '%s\n' "${RESULTS[@]}")""".strip().split('\n'):
    if not line: continue
    pid, run, typ, tok, eval_ms, wall_ms, tps = line.split('|')
    rows.append({
        'id': pid,
        'run': int(run),
        'type': typ,
        'tokens': int(tok),
        'eval_ms': int(eval_ms),
        'wall_ms': int(wall_ms),
        'tps': float(tps),
    })

warm = [r['tps'] for r in rows if r['type'] == 'warm' and r['tps'] > 0]
cold = [r['tps'] for r in rows if r['type'] == 'cold' and r['tps'] > 0]

def median(xs):
    if not xs: return 0
    s = sorted(xs)
    n = len(s)
    return (s[n//2] + s[(n-1)//2]) / 2

total_wall_ms = sum(r['wall_ms'] for r in rows)
total_tokens = sum(r['tokens'] for r in rows)

import json
print(json.dumps({
    'rows': rows,
    'warm_median_tps': round(median(warm), 2),
    'warm_min_tps': round(min(warm), 2) if warm else 0,
    'warm_max_tps': round(max(warm), 2) if warm else 0,
    'cold_tps': round(cold[0], 2) if cold else 0,
    'total_wall_s': round(total_wall_ms / 1000, 1),
    'total_tokens': total_tokens,
}))
PYEOF
)

WARM_MEDIAN=$(echo "$STATS_JSON" | python3 -c 'import sys,json; print(json.load(sys.stdin)["warm_median_tps"])')
WARM_MIN=$(echo "$STATS_JSON" | python3 -c 'import sys,json; print(json.load(sys.stdin)["warm_min_tps"])')
WARM_MAX=$(echo "$STATS_JSON" | python3 -c 'import sys,json; print(json.load(sys.stdin)["warm_max_tps"])')
COLD_TPS=$(echo "$STATS_JSON" | python3 -c 'import sys,json; print(json.load(sys.stdin)["cold_tps"])')
TOTAL_WALL_S=$(echo "$STATS_JSON" | python3 -c 'import sys,json; print(json.load(sys.stdin)["total_wall_s"])')
TOTAL_TOKENS=$(echo "$STATS_JSON" | python3 -c 'import sys,json; print(json.load(sys.stdin)["total_tokens"])')

# -- Peak RAM snapshot from the Ollama server process, if visible --
OLLAMA_RSS_KB=""
if command -v pidof >/dev/null 2>&1; then
  OLLAMA_PID=$(pidof ollama 2>/dev/null | awk '{print $1}')
  if [ -n "$OLLAMA_PID" ] && [ -r "/proc/$OLLAMA_PID/status" ]; then
    OLLAMA_RSS_KB=$(grep -m1 "^VmRSS:" "/proc/$OLLAMA_PID/status" | awk '{print $2}')
  fi
fi

# -- Write the markdown report --
mkdir -p "$(dirname "$OUTPUT")"
TIMESTAMP=$(date -u +%Y-%m-%dT%H:%M:%SZ)

{
  echo "# Benchmark: $MANUFACTURER $MODEL_NAME"
  echo ""
  echo "<!-- Verified on: $MANUFACTURER $MODEL_NAME, Android $ANDROID_VERSION, SoC $SOC -->"
  echo ""
  echo "| | |"
  echo "|---|---|"
  echo "| **Device**           | $MANUFACTURER $MODEL_NAME |"
  echo "| **SoC**              | $SOC |"
  echo "| **RAM total**        | ${RAM_TOTAL_MB} MiB |"
  echo "| **Android version**  | $ANDROID_VERSION |"
  echo "| **Ollama version**   | $OLLAMA_VERSION |"
  echo "| **Model**            | \`$MODEL\` |"
  echo "| **Prompts version**  | $PROMPTS_VERSION |"
  echo "| **Runs per prompt**  | $RUNS |"
  echo "| **Generated**        | $TIMESTAMP |"
  if [ -n "$OLLAMA_RSS_KB" ]; then
    echo "| **Ollama VmRSS (end)** | $((OLLAMA_RSS_KB / 1024)) MiB |"
  fi
  echo ""
  echo "## Summary"
  echo ""
  echo "- **Warm median:** \`${WARM_MEDIAN} tok/s\`"
  echo "- **Warm range:** ${WARM_MIN}..${WARM_MAX} tok/s"
  echo "- **Cold first call:** \`${COLD_TPS} tok/s\` (includes model load)"
  echo "- **Total tokens generated:** $TOTAL_TOKENS"
  echo "- **Total wall clock:** ${TOTAL_WALL_S}s"
  echo ""
  echo "## Per-prompt detail"
  echo ""
  echo "| Prompt | Run | Type | Tokens | Eval ms | Wall ms | tok/s |"
  echo "|---|---|---|---|---|---|---|"
  for r in "${RESULTS[@]}"; do
    IFS='|' read -r pid run typ tok eval_ms wall_ms tps <<< "$r"
    printf "| %s | %s | %s | %s | %s | %s | %s |\n" "$pid" "$run" "$typ" "$tok" "$eval_ms" "$wall_ms" "$tps"
  done
  echo ""
  echo "## How this was generated"
  echo ""
  echo "\`\`\`"
  echo "bash scripts/bench.sh --model $MODEL --runs $RUNS"
  echo "\`\`\`"
  echo ""
  echo "Fixed prompt set at \`benchmarks/prompts.json\` (version $PROMPTS_VERSION)."
  echo "Contribute your device's numbers by running bench.sh and opening a PR"
  echo "with the generated file. See \`benchmarks/README.md\` for the workflow."
} > "$OUTPUT"

echo ""
ok "Wrote $OUTPUT"
echo ""
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "  ${GREEN}Warm median: ${WARM_MEDIAN} tok/s${NC}"
echo -e "  Cold first:  ${COLD_TPS} tok/s"
echo -e "  Total time:  ${TOTAL_WALL_S}s"
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
