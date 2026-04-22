#!/usr/bin/env bash
# tools/deploy/build.sh — invoked by spacegame-deploy.service (timer-triggered).
# Pulls origin/main, installs deps, builds, rsyncs dist/ to the Caddy webroot.
#
# Idempotent — rerunning without new commits is a ~2s no-op (git no-new-refs,
# rsync has no changes, caddy keeps serving the existing webroot).
#
# Exit codes:
#   0  success or already-up-to-date
#   1  git / npm / build failure
#   2  webroot is not writable
#
# Tunable via env overrides (set in the systemd unit, see README.md):
#   SPACEGAME_REPO       git checkout dir                (default /opt/spacegame-repo)
#   SPACEGAME_WEBROOT    target served by caddy          (default /var/www/spacegame)
#   SPACEGAME_BRANCH     branch to track                 (default main)
#   SPACEGAME_REMOTE     git remote name                 (default origin)

set -euo pipefail

REPO="${SPACEGAME_REPO:-/opt/spacegame-repo}"
WEBROOT="${SPACEGAME_WEBROOT:-/var/www/spacegame}"
BRANCH="${SPACEGAME_BRANCH:-main}"
REMOTE="${SPACEGAME_REMOTE:-origin}"

log() {
  echo "[spacegame-deploy $(date -u +%H:%M:%SZ)] $*"
}

if [[ ! -d "$REPO/.git" ]]; then
  log "ERROR: $REPO is not a git checkout. Run first-time setup from README.md."
  exit 1
fi

if [[ ! -d "$WEBROOT" ]] || [[ ! -w "$WEBROOT" ]]; then
  log "ERROR: $WEBROOT missing or not writable by uid $(id -u)."
  exit 2
fi

cd "$REPO"

log "fetching $REMOTE/$BRANCH"
# --prune drops stale refs; --quiet keeps the log clean when there are none.
git fetch --prune --quiet "$REMOTE" "$BRANCH"

LOCAL="$(git rev-parse HEAD)"
UPSTREAM="$(git rev-parse "$REMOTE/$BRANCH")"

# Force a build if the webroot is empty — this avoids the "first-tick
# no-op" chicken-egg BMO hit during install: if someone had already
# pulled main into $REPO manually before enabling the service, LOCAL ==
# UPSTREAM on the first tick and the webroot stayed empty forever.
# --force env override short-circuits too (for manual rebuilds after an
# external webroot wipe, node_modules flush, etc.).
WEBROOT_EMPTY=0
if [[ -z "$(ls -A "$WEBROOT" 2>/dev/null)" ]]; then
  WEBROOT_EMPTY=1
fi

if [[ "$LOCAL" == "$UPSTREAM" && "$WEBROOT_EMPTY" -eq 0 && "${FORCE:-0}" != "1" ]]; then
  log "already at $UPSTREAM — nothing to do"
  exit 0
fi

if [[ "$WEBROOT_EMPTY" -eq 1 ]]; then
  log "webroot $WEBROOT is empty — forcing build even though repo is at $UPSTREAM"
elif [[ "${FORCE:-0}" == "1" ]]; then
  log "FORCE=1 — forcing build even though repo is at $UPSTREAM"
else
  log "updating $LOCAL → $UPSTREAM"
fi
git reset --hard --quiet "$UPSTREAM"

log "installing deps (npm ci)"
npm ci --no-audit --no-fund --prefer-offline --silent

log "building (npm run build)"
npm run build --silent

if [[ ! -d "$REPO/dist" ]]; then
  log "ERROR: build did not produce dist/"
  exit 1
fi

log "rsync dist/ → $WEBROOT"
# --delete removes stale assets (old hashed bundles) so the webroot stays
# tight. --checksum avoids mtime flaps when CI doesn't preserve them.
rsync -a --delete --checksum "$REPO/dist/" "$WEBROOT/"

log "done — deployed $UPSTREAM"
