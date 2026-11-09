#!/usr/bin/env bash
# One-shot setup: Python venv + deps for the API, npm deps for the UI.
set -euo pipefail
cd "$(dirname "$0")"

PY_BIN=""
for candidate in python3.12 python3.11 python3.10; do
  command -v "$candidate" >/dev/null 2>&1 && { PY_BIN="$candidate"; break; }
done

echo "==> backend"
if [ -n "$PY_BIN" ]; then
  [ -d backend/.venv ] || "$PY_BIN" -m venv backend/.venv
  PIP="backend/.venv/bin/pip"
  "$PIP" install -q --upgrade pip wheel
else
  # misaki/spacy publish no wheels for 3.13+, so provision a 3.12 with uv.
  echo "    no python3.10-3.12 found; provisioning one with uv"
  command -v uv >/dev/null 2>&1 || python3 -m pip install --user -q uv
  UV="$(command -v uv || echo "$HOME/.local/bin/uv")"
  "$UV" python install 3.12
  [ -d backend/.venv ] || "$UV" venv --python 3.12 backend/.venv
  PIP="backend/.venv/bin/pip"
  "$PIP" install -q --upgrade pip wheel
fi

# CPU wheels unless an NVIDIA GPU is present (torch from PyPI is CUDA-enabled).
EXTRA=""
command -v nvidia-smi >/dev/null 2>&1 || EXTRA="--extra-index-url https://download.pytorch.org/whl/cpu"
# shellcheck disable=SC2086
"$PIP" install $EXTRA -r backend/requirements.txt

if [ "${WITH_DIACRITIZER:-0}" = "1" ]; then
  echo "==> optional MSA diacritizer (camel-tools)"
  "$PIP" install -r backend/requirements-diacritizer.txt
  backend/.venv/bin/camel_data -i disambig-mle-calima-msa-r13
fi

echo "==> frontend"
( cd frontend && npm install --silent )

echo
echo "Done. Start both servers with:  ./run.sh"
