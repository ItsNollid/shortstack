#!/usr/bin/env bash
# Everything that has to pass. Fails loudly: piping tsc into tail hides its exit code, which is how
# a typecheck error once slipped into a commit whose tests were green.
set -euo pipefail
npm run typecheck
npm test
npm run build
echo "All checks passed."
