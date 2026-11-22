#!/usr/bin/env sh
# POSIX equivalent of train_all.ps1
set -e
cd "$(dirname "$0")/.."
PY=${PY:-.venv/bin/python}
export PYTHONIOENCODING=utf-8
$PY scripts/download_data.py && $PY ml/datasets/prepare.py && $PY ml/datasets/augment.py && $PY ml/training/train.py && $PY ml/evaluation/evaluate.py
