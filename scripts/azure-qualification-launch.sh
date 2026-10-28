#!/bin/sh
set -eu
unset NODE_OPTIONS NODE_PATH
mode=${1-}
[ "$#" -gt 0 ] && shift
case "$mode" in
  verify) exec node "$(dirname "$0")/azure-qualification-launch.mjs" verify "$@" ;;
  prove) exec node "$(dirname "$0")/azure-qualification-launch.mjs" prove "$@" ;;
  bootstrap) exec node "$(dirname "$0")/azure-qualification-launch.mjs" bootstrap "$@" ;;
  install) exec npm ci --ignore-scripts ;;
  *) echo 'Unsupported qualification launch mode' >&2; exit 1 ;;
esac
