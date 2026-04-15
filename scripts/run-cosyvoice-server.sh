#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COSYVOICE_DIR="$ROOT_DIR/vendor/CosyVoice"
if [[ -x "$COSYVOICE_DIR/.venv310/bin/python" ]]; then
  COSYVOICE_PY="$COSYVOICE_DIR/.venv310/bin/python"
else
  COSYVOICE_PY="$COSYVOICE_DIR/.venv/bin/python"
fi
COSYVOICE_PORT="${COSYVOICE_PORT:-50000}"
DEFAULT_LOCAL_MODEL_DIR="$COSYVOICE_DIR/pretrained_models/CosyVoice-300M"
if [[ -n "${COSYVOICE_MODEL_DIR:-}" ]]; then
  RESOLVED_MODEL_DIR="$COSYVOICE_MODEL_DIR"
elif [[ -d "$DEFAULT_LOCAL_MODEL_DIR" ]]; then
  RESOLVED_MODEL_DIR="$DEFAULT_LOCAL_MODEL_DIR"
else
  RESOLVED_MODEL_DIR="iic/CosyVoice-300M"
fi

if [[ ! -x "$COSYVOICE_PY" ]]; then
  echo "CosyVoice virtual environment not found at: $COSYVOICE_PY" >&2
  exit 1
fi

cd "$COSYVOICE_DIR"
echo "Starting CosyVoice with model: $RESOLVED_MODEL_DIR"
exec "$COSYVOICE_PY" "$ROOT_DIR/scripts/cosyvoice_fastapi_server.py" \
  --port "$COSYVOICE_PORT" \
  --model_dir "$RESOLVED_MODEL_DIR"
