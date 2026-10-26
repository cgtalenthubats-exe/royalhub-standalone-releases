#!/bin/bash
cd "$(dirname "$0")"

DEFAULT_DIR="$(pwd)"
if [ -d "backups" ]; then DEFAULT_DIR="$(pwd)/backups"; fi
PICKED=$(osascript -e "POSIX path of (choose file with prompt \"Pick the RoyalHub-Backup-....zip file\" of type {\"zip\"} default location (POSIX file \"$DEFAULT_DIR\"))" 2>/dev/null)
if [ -z "$PICKED" ]; then exit 0; fi

osascript -e "display dialog \"This replaces everything currently in this RoyalHub installation — the database, uploaded photos, and compensation key — with what's inside:\n\n$(basename "$PICKED")\n\nThis cannot be undone. Continue?\" with title \"RoyalHub Standalone — Restore\" buttons {\"Cancel\", \"Restore\"} default button \"Cancel\""
if [ $? -ne 0 ]; then exit 0; fi

TMP=$(mktemp -d)
unzip -oq "$PICKED" -d "$TMP"
if [ ! -d "$TMP/data" ]; then
    osascript -e 'display dialog "That file doesn'"'"'t look like a RoyalHub backup — no data folder found inside it." with title "RoyalHub Standalone — Restore" buttons {"OK"} default button "OK"'
    rm -rf "$TMP"
    exit 1
fi

rm -rf data
mv "$TMP/data" data
if [ -f "$TMP/.env.local" ]; then
    mv "$TMP/.env.local" .env.local
fi
rm -rf "$TMP"

osascript -e 'display dialog "Data restored. You can now run launch-mac.command as usual." with title "RoyalHub Standalone — Restore" buttons {"OK"} default button "OK"'
