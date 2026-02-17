#!/usr/bin/env bash
set -euo pipefail

PACKAGE_NAME="debaitable"

if ! command -v node >/dev/null 2>&1; then
  echo "Error: Node.js is required. Install Node.js first." >&2
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "Error: npm is required. Install npm first." >&2
  exit 1
fi

echo "Installing ${PACKAGE_NAME} globally..."
npm install -g "${PACKAGE_NAME}@latest"

GLOBAL_PREFIX="$(npm config get prefix)"
GLOBAL_BIN="${GLOBAL_PREFIX}/bin"

if ! command -v "${PACKAGE_NAME}" >/dev/null 2>&1; then
  cat <<EOF
Installed, but '${PACKAGE_NAME}' is not on PATH in this shell.
Add this to your shell config:
  export PATH="${GLOBAL_BIN}:\$PATH"
Then restart your shell.
EOF
else
  echo "Installed successfully. Run: ${PACKAGE_NAME}"
  echo "You can also run without global install via: npx ${PACKAGE_NAME}"
fi
