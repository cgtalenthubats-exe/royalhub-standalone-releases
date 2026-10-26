@echo off
cd /d "%~dp0"

if not exist "data" (
    echo No data folder found yet - nothing to back up. Run the app at least once first.
    pause
    exit /b 1
)

powershell -NoProfile -Sta -Command "Add-Type -AssemblyName System.Windows.Forms; $r = [System.Windows.Forms.MessageBox]::Show('This saves everything - your database, uploaded photos, and the key that unlocks compensation figures - into one file in this app''s backups folder.' + [Environment]::NewLine + [Environment]::NewLine + 'You can then copy that one file to another computer (USB drive, email to yourself, Google Drive, etc.) and use restore-data.bat there to bring everything back.', 'RoyalHub Standalone - Backup', 'OKCancel', 'Information'); if ($r -ne 'OK') { exit 1 }"
if errorlevel 1 exit /b 0

powershell -NoProfile -Sta -ExecutionPolicy Bypass -Command "$ErrorActionPreference = 'Stop'; Add-Type -AssemblyName System.Windows.Forms; try { $stamp = Get-Date -Format 'yyyy-MM-dd-HHmm'; $backupDir = Join-Path (Get-Location) 'backups'; New-Item -ItemType Directory -Force -Path $backupDir | Out-Null; $out = Join-Path $backupDir ('RoyalHub-Backup-' + $stamp + '.zip'); $items = @('data'); if (Test-Path '.env.local') { $items += '.env.local' }; Compress-Archive -Path $items -DestinationPath $out -Force; [System.Windows.Forms.MessageBox]::Show('Backup saved to this app''s backups folder:' + [Environment]::NewLine + [Environment]::NewLine + 'backups\' + (Split-Path $out -Leaf) + [Environment]::NewLine + [Environment]::NewLine + 'Copy this file to the other computer, then double-click restore-data.bat there.', 'RoyalHub Standalone - Backup', 'OK', 'Information') | Out-Null } catch { [System.Windows.Forms.MessageBox]::Show('Something went wrong - no backup file was created.' + [Environment]::NewLine + [Environment]::NewLine + $_.Exception.Message, 'RoyalHub Standalone - Backup', 'OK', 'Error') | Out-Null; exit 1 }"
