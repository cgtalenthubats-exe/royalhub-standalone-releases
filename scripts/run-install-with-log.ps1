# Runs "npm install" with its full output both shown live (same as always)
# AND saved to install-log.txt in the project root - so if something fails,
# there's a real file to send instead of a cropped phone screenshot of a
# scrolling terminal. cmd.exe has no built-in way to do both at once
# (no "tee"), hence this tiny PowerShell helper both launch-windows.bat and
# launch-windows.hta call into, instead of duplicating the same trick twice.
#
# npm writes its routine "npm warn deprecated ..." lines to stderr, which is
# normal and not a failure - but merging a native process's stderr into a
# PowerShell pipeline with "2>&1" wraps every one of those lines as a
# NativeCommandError object (red text, "At line:1 char:1 ..."
# "FullyQualifiedErrorId: NativeCommandError" and all) when displayed or
# logged, which looks exactly like something broke even when npm finishes
# fine. ForEach-Object { "$_" } stringifies each item first (plain text for
# an ordinary line, or just that line's own text for a stderr one) before
# Tee-Object ever sees it.
$ErrorActionPreference = "Continue"
npm install 2>&1 | ForEach-Object { "$_" } | Tee-Object -FilePath "install-log.txt"
exit $LASTEXITCODE
