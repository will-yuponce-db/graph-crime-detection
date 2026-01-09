#!/usr/bin/env bash
set -euo pipefail

# Export a Databricks Workspace directory into this repo directory.
#
# Usage:
#   scripts/dbx_export.sh /Workspace/Users/<you>@databricks.com/crime-graph
#
# Optional env:
#   DBX_PROFILE=<profile>   (uses databricks CLI profile)

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <WORKSPACE_DIR_PATH>"
  echo "Example: $0 /Workspace/Users/will.yuponce@databricks.com/crime-graph"
  exit 2
fi

WORKSPACE_DIR_PATH="$1"
LOCAL_DIR="$(pwd)"

PROFILE_ARGS=()
if [[ -n "${DBX_PROFILE:-}" ]]; then
  PROFILE_ARGS+=(--profile "${DBX_PROFILE}")
fi

echo "Exporting:"
echo "  from: ${WORKSPACE_DIR_PATH}"
echo "  to:   ${LOCAL_DIR}"
echo

databricks workspace export-dir "${WORKSPACE_DIR_PATH}" "${LOCAL_DIR}" --overwrite "${PROFILE_ARGS[@]}"






