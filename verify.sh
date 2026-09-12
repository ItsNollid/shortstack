#!/usr/bin/env bash
# Everything that has to pass. Runs unpiped under set -e: piping any of these into tail reports
# tail's exit code, not the tool's, which has now hidden a failure twice.
set -euo pipefail
npm run typecheck
npm test
npm run build
echo "ALL CHECKS PASSED"
