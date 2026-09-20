#!/usr/bin/env bash
# Create venv and install Python deps for the pipecat server.
set -euo pipefail
cd /opt/cortex-pipecat
python3 -m venv venv
./venv/bin/pip install --upgrade pip setuptools wheel
./venv/bin/pip install -r requirements.txt
echo "PIP_INSTALL_OK"
