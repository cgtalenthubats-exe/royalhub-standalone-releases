#!/bin/bash
cd "$(dirname "$0")"

osascript -e 'display dialog "This saves everything — your database, uploaded photos, and the key that unlocks compensation figures — into one file in this app'"'"'s backups folder.\n\nYou can then copy that one file to another computer (USB drive, email to yourself, Google Drive, etc.) and use restore-data.command there to bring everything back." with title "RoyalHub Standalone — Backup" buttons {"Cancel", "Back Up Now"} default button "Back Up Now"'
if [ $? -ne 0 ]; then exit 0; fi

if [ ! -d "data" ]; then
    osascript -e 'display dialog "No data folder found yet — nothing to back up. Run the app at least once first." with title "RoyalHub Standalone — Backup" buttons {"OK"} default button "OK"'
    exit 1
fi

mkdir -p backups
STAMP=$(date +"%Y-%m-%d-%H%M")
OUT="$(pwd)/backups/RoyalHub-Backup-$STAMP.zip"

# -X drops macOS's extended-attribute (resource fork) junk from the zip so it
# stays a clean, predictable archive on whatever computer it's restored on.
ZIP_ARGS=(-rX "$OUT" data)
if [ -f ".env.local" ]; then
    ZIP_ARGS+=(.env.local)
fi
zip "${ZIP_ARGS[@]}" >/dev/null

if [ -f "$OUT" ]; then
    osascript -e "display dialog \"Backup saved to this app's backups folder:\n\nbackups/$(basename "$OUT")\n\nCopy this file to the other computer, then double-click restore-data.command there.\" with title \"RoyalHub Standalone — Backup\" buttons {\"OK\"} default button \"OK\""
else
    osascript -e 'display dialog "Something went wrong — no backup file was created. Try again, or ask for help." with title "RoyalHub Standalone — Backup" buttons {"OK"} default button "OK"'
    exit 1
fi
