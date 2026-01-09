#!/usr/bin/env bash
set -euo pipefail

# Sync this repo to a Databricks Workspace directory and keep syncing on changes.
#
# Usage:
#   scripts/dbx_sync_watch.sh /Workspace/Users/<you>@databricks.com/crime-graph
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

EXCLUDE_FROM=()
if [[ -f "${LOCAL_DIR}/.databricksignore" ]]; then
  EXCLUDE_FROM=(--exclude-from "${LOCAL_DIR}/.databricksignore")
fi

echo "Watching sync:"
echo "  from: ${LOCAL_DIR}"
echo "  to:   ${WORKSPACE_DIR_PATH}"
echo

databricks sync --watch "${LOCAL_DIR}" "${WORKSPACE_DIR_PATH}" "${EXCLUDE_FROM[@]}" "${PROFILE_ARGS[@]}"






