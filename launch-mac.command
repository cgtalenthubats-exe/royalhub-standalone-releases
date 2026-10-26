#!/bin/bash
cd "$(dirname "$0")"
# Silences the one-time "SQLite is an experimental feature" notice from
# Node's built-in node:sqlite (used for the local database) - harmless, but
# not worth it looking like something's wrong on first run.
export NODE_OPTIONS="--disable-warning=ExperimentalWarning"

CHOICE=$(osascript -e 'choose from list {"Run the app", "Back up my data", "Restore from a backup"} with title "RoyalHub Standalone" with prompt "What would you like to do?" default items {"Run the app"}')
if [ "$CHOICE" = "false" ] || [ -z "$CHOICE" ]; then exit 0; fi

if [ "$CHOICE" = "Back up my data" ]; then
    exec bash "backup-data.command"
fi
if [ "$CHOICE" = "Restore from a backup" ]; then
    exec bash "restore-data.command"
fi

echo "Starting the app..."
echo "(Closing this window stops the app.)"

if ! command -v npm >/dev/null 2>&1; then
    echo "Node.js is required but wasn't found on this Mac."
    osascript -e 'display dialog "Node.js is required but wasn'"'"'t found on this Mac.\n\nDownload and install it from nodejs.org (any current version works), then run this file again." with title "RoyalHub Standalone" buttons {"Open nodejs.org", "Close"} default button "Open nodejs.org"' -e 'if button returned of result is "Open nodejs.org" then do shell script "open https://nodejs.org"'
    exit 1
fi

# Confirms the installed Node.js is new enough (this app needs 22.13+ for its
# built-in database support) before going any further, instead of letting an
# old version fail confusingly deeper inside npm install.
NODEVER=$(node -v | sed 's/^v//')
NODE_MAJOR=$(echo "$NODEVER" | cut -d. -f1)
NODE_MINOR=$(echo "$NODEVER" | cut -d. -f2)
if [ "$NODE_MAJOR" -lt 22 ] || { [ "$NODE_MAJOR" -eq 22 ] && [ "$NODE_MINOR" -lt 13 ]; }; then
    echo "Node.js v$NODEVER was found, but it's too old for this app (needs v22.13 or later)."
    osascript -e 'display dialog "Node.js v'"$NODEVER"' was found, but it'"'"'s too old for this app (needs v22.13 or later).\n\nDownload a newer version from nodejs.org, then run this file again." with title "RoyalHub Standalone" buttons {"Open nodejs.org", "Close"} default button "Open nodejs.org"' -e 'if button returned of result is "Open nodejs.org" then do shell script "open https://nodejs.org"'
    exit 1
fi
echo "Node.js v$NODEVER found."

# Checks the public release mirror for a newer version and applies it in
# place automatically (see scripts/patch.sh) - no GitHub login involved,
# works the same whether this copy came from "git clone" or a ZIP download.
# Never blocks starting the app, even if this check fails (e.g. no
# internet) - this app is supposed to work fully offline too.
echo "Checking for updates..."
PATCHRESULT=$(bash scripts/patch.sh)
case "$PATCHRESULT" in
    PATCHED:*) echo "==> Updated to the latest version." ;;
    UP_TO_DATE:*) echo "==> Already up to date." ;;
    CHECK_FAILED*) echo "==> Could not check for updates (no internet?) - continuing with the current version." ;;
    PATCH_FAILED:*) echo "==> Update failed - continuing with the current version. Contact your IT support person if this keeps happening." ;;
esac

npm install 2>&1 | tee install-log.txt
if [ ${PIPESTATUS[0]} -ne 0 ]; then
    osascript -e 'display dialog "npm install failed.\n\nA full log was saved to install-log.txt in this same folder. If you need help, send that file." with title "RoyalHub Standalone" buttons {"OK"} default button "OK"'
    exit 1
fi

( for i in $(seq 1 120); do
    curl -s -o /dev/null http://localhost:3000 && { open http://localhost:3000; break; }
    sleep 1
  done ) &
npm run dev
