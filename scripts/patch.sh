#!/bin/bash
# Mirrors scripts/patch.ps1's behavior for macOS - checks the public release
# mirror for a newer version and applies it in place, automatically. No
# GitHub login involved (the release repo is public, this is a plain
# unauthenticated HTTPS request), works the same whether this copy came
# from "git clone" or a plain ZIP download.
#
# Prints exactly one of these lines (launch-mac.command reads this):
#   UP_TO_DATE:<version>
#   CHECK_FAILED                  (e.g. no internet - NOT a failure, just
#                                   means "couldn't check this time", so the
#                                   app still starts fine offline)
#   PATCHED:<old-version>:<new-version>
#   PATCH_FAILED:<reason>
#
# Never touches data/, backups/, .env.local, or node_modules - only the
# application's own files.

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RELEASE_RAW="https://raw.githubusercontent.com/cgtalenthubats-exe/royalhub-standalone-releases/main"
RELEASE_ZIP="https://github.com/cgtalenthubats-exe/royalhub-standalone-releases/archive/refs/heads/main.zip"
VERSION_FILE="$ROOT/version.json"

extract_version() {
    grep -o '"version"[[:space:]]*:[[:space:]]*"[^"]*"' "$1" 2>/dev/null | head -1 | sed -E 's/.*"([^"]+)"$/\1/'
}

LOCAL_VERSION="0.0.0"
if [ -f "$VERSION_FILE" ]; then
    v=$(extract_version "$VERSION_FILE")
    [ -n "$v" ] && LOCAL_VERSION="$v"
fi

REMOTE_JSON=$(curl -fsSL --max-time 15 "$RELEASE_RAW/version.json" 2>/dev/null)
if [ -z "$REMOTE_JSON" ]; then
    echo "CHECK_FAILED"
    exit 0
fi
REMOTE_VERSION=$(echo "$REMOTE_JSON" | grep -o '"version"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed -E 's/.*"([^"]+)"$/\1/')

if [ "$LOCAL_VERSION" = "$REMOTE_VERSION" ]; then
    echo "UP_TO_DATE:$LOCAL_VERSION"
    exit 0
fi

# --- A newer version exists - back up first, then apply it ---
if [ -d "$ROOT/data" ]; then
    STAMP=$(date +%Y-%m-%d-%H%M%S)
    mkdir -p "$ROOT/backups"
    (
        cd "$ROOT" || exit 1
        if [ -f ".env.local" ]; then
            zip -r -q "backups/pre-patch-$STAMP.zip" data .env.local
        else
            zip -r -q "backups/pre-patch-$STAMP.zip" data
        fi
    )
    if [ $? -ne 0 ]; then
        echo "PATCH_FAILED:could not back up data first"
        exit 1
    fi
fi

TMPDIR_PATCH=$(mktemp -d "${TMPDIR:-/tmp}/royalhub-patch.XXXXXX")
trap 'rm -rf "$TMPDIR_PATCH"' EXIT

if ! curl -fsSL --max-time 180 -o "$TMPDIR_PATCH/release.zip" "$RELEASE_ZIP"; then
    echo "PATCH_FAILED:download failed"
    exit 1
fi

if ! unzip -q "$TMPDIR_PATCH/release.zip" -d "$TMPDIR_PATCH"; then
    echo "PATCH_FAILED:could not extract the downloaded update"
    exit 1
fi

EXTRACTED_DIR=$(find "$TMPDIR_PATCH" -maxdepth 1 -type d -name "royalhub-standalone-releases-*" | head -1)
if [ -z "$EXTRACTED_DIR" ]; then
    echo "PATCH_FAILED:downloaded update was not in the expected format"
    exit 1
fi

# Overlays the new files onto the app folder, same protections as the
# Windows patcher (scripts/patch.ps1) - never touches data/backups/env/
# node_modules, and only adds/overwrites, never deletes a file the new
# version removed.
if ! rsync -a --exclude='data/' --exclude='backups/' --exclude='.git/' --exclude='.next/' --exclude='node_modules/' --exclude='.env.local' --exclude='install-log.txt' --exclude='version.json' "$EXTRACTED_DIR/" "$ROOT/"; then
    echo "PATCH_FAILED:file copy error"
    exit 1
fi

cp "$EXTRACTED_DIR/version.json" "$VERSION_FILE"

echo "PATCHED:$LOCAL_VERSION:$REMOTE_VERSION"
exit 0
