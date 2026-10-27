# Checks the public release mirror for a newer version and applies it in
# place, automatically - no GitHub login involved (the release repo is
# public, this is a plain unauthenticated HTTPS request), no "git pull",
# no account-picker popup, works the same whether this copy came from
# "git clone" or a plain ZIP download.
#
# Prints exactly one of these lines (launch-windows.bat/.hta read this):
#   UP_TO_DATE:<version>
#   CHECK_FAILED                  (e.g. no internet - NOT a failure, just
#                                   means "couldn't check this time", so the
#                                   app still starts fine offline)
#   PATCHED:<old-version>:<new-version>
#   PATCH_FAILED:<reason>
#
# Never touches data/, backups/, .env.local, or node_modules - only the
# application's own files.

$ErrorActionPreference = "Stop"

# Windows PowerShell's default .NET security protocol can be stuck on an
# older TLS version depending on this machine's own Windows/.NET update
# history, which GitHub's servers (TLS 1.2+ only) silently reject - the
# connection just fails as if there were no internet at all. Forcing TLS
# 1.2 here fixes that without needing any change on the machine itself.
try {
    [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
} catch {}

$root = Split-Path -Parent $PSScriptRoot
$releaseRaw = "https://raw.githubusercontent.com/cgtalenthubats-exe/royalhub-standalone-releases/main"
$releaseZip = "https://github.com/cgtalenthubats-exe/royalhub-standalone-releases/archive/refs/heads/main.zip"
$versionFile = Join-Path $root "version.json"

function Get-LocalVersion {
    if (Test-Path $versionFile) {
        try { return (Get-Content $versionFile -Raw | ConvertFrom-Json).version } catch { return "0.0.0" }
    }
    return "0.0.0"
}

$localVersion = Get-LocalVersion

try {
    $remote = Invoke-RestMethod -Uri "$releaseRaw/version.json" -TimeoutSec 15
} catch {
    Write-Output "CHECK_FAILED"
    exit 0
}

if ($localVersion -eq $remote.version) {
    Write-Output "UP_TO_DATE:$localVersion"
    exit 0
}

# --- A newer version exists - back up first, then apply it ---
try {
    $stamp = Get-Date -Format "yyyy-MM-dd-HHmmss"
    $backupDir = Join-Path $root "backups"
    New-Item -ItemType Directory -Force -Path $backupDir | Out-Null
    $backupOut = Join-Path $backupDir "pre-patch-$stamp.zip"
    $items = @(Join-Path $root "data")
    $envLocal = Join-Path $root ".env.local"
    if (Test-Path $envLocal) { $items += $envLocal }
    if (Test-Path (Join-Path $root "data")) {
        Compress-Archive -Path $items -DestinationPath $backupOut -Force
    }
} catch {
    Write-Output "PATCH_FAILED:could not back up data first ($($_.Exception.Message))"
    exit 1
}

$tempDir = Join-Path $env:TEMP "royalhub-patch-$([guid]::NewGuid().ToString('N').Substring(0,8))"
try {
    New-Item -ItemType Directory -Path $tempDir | Out-Null
    $zipPath = Join-Path $tempDir "release.zip"
    Invoke-WebRequest -Uri $releaseZip -OutFile $zipPath -TimeoutSec 180
    Expand-Archive -Path $zipPath -DestinationPath $tempDir -Force

    $extractedDir = Get-ChildItem -Path $tempDir -Directory | Where-Object { $_.Name -like "royalhub-standalone-releases-*" } | Select-Object -First 1
    if (-not $extractedDir) {
        Write-Output "PATCH_FAILED:downloaded update was not in the expected format"
        exit 1
    }

    # Overlays the new files onto the app folder. /XD and /XF protect
    # everything that holds this computer's own data (or anything that
    # might currently be running) from ever being touched by the patch.
    # This copies/overwrites but never deletes a file that the new version
    # removed - a stale leftover file is a much smaller risk than a bug in
    # this exclude list deleting something it shouldn't.
    robocopy $extractedDir.FullName $root /E /XD data backups node_modules .git .next /XF .env.local install-log.txt version.json /NFL /NDL /NJH /NJS /NP | Out-Null
    if ($LASTEXITCODE -ge 8) {
        Write-Output "PATCH_FAILED:file copy error (robocopy code $LASTEXITCODE)"
        exit 1
    }

    Copy-Item -Path (Join-Path $extractedDir.FullName "version.json") -Destination $versionFile -Force
} catch {
    Write-Output "PATCH_FAILED:$($_.Exception.Message)"
    exit 1
} finally {
    Remove-Item -Path $tempDir -Recurse -Force -ErrorAction SilentlyContinue
}

Write-Output "PATCHED:$localVersion:$($remote.version)"
exit 0
