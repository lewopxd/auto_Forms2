# ============================================
# Recover Antigravity - Emergency Script
# ============================================
# Use this script if Antigravity is stuck in suspended state
# after AutoForms crashes or exits abnormally.
#
# This script uses pssuspend from Sysinternals if available,
# or provides instructions for manual recovery.
# ============================================

Write-Host ""
Write-Host "=" * 60 -ForegroundColor Cyan
Write-Host "  ANTIGRAVITY RECOVERY SCRIPT" -ForegroundColor White
Write-Host "=" * 60 -ForegroundColor Cyan
Write-Host ""

# Find all Antigravity-related processes (including language server)
$processes = Get-Process | Where-Object { 
    $_.ProcessName -like "*Antigravity*" -or 
    $_.ProcessName -like "*language_server_windows*" 
}

if ($processes.Count -eq 0) {
    Write-Host "[!] No Antigravity processes found." -ForegroundColor Yellow
    Write-Host "    Antigravity may not be running or was not suspended." -ForegroundColor Gray
    Write-Host ""
    exit 0
}

Write-Host "[*] Found $($processes.Count) Antigravity processes:" -ForegroundColor Green
Write-Host ""

foreach ($proc in $processes) {
    $status = "Running"
    try {
        # Check if process threads are suspended
        $threads = $proc.Threads
        $suspendedThreads = $threads | Where-Object { $_.WaitReason -eq "Suspended" }
        if ($suspendedThreads.Count -gt 0) {
            $status = "SUSPENDED"
        }
    }
    catch {
        $status = "Unknown"
    }
    
    Write-Host "  PID: $($proc.Id) | Name: $($proc.ProcessName) | Status: $status" -ForegroundColor $(if ($status -eq "SUSPENDED") { "Red" } else { "Gray" })
}

Write-Host ""
Write-Host "-" * 60 -ForegroundColor DarkGray

# Check if pssuspend is available
$pssuspend = Get-Command "pssuspend" -ErrorAction SilentlyContinue
$pssuspend64 = Get-Command "pssuspend64" -ErrorAction SilentlyContinue

if ($pssuspend -or $pssuspend64) {
    $tool = if ($pssuspend64) { "pssuspend64" } else { "pssuspend" }
    Write-Host ""
    Write-Host "[*] Found $tool. Attempting to resume all Antigravity processes..." -ForegroundColor Green
    Write-Host ""
    
    foreach ($proc in $processes) {
        Write-Host "    Resuming PID $($proc.Id)..." -NoNewline
        try {
            & $tool -r $proc.Id 2>$null | Out-Null
            Write-Host " OK" -ForegroundColor Green
        }
        catch {
            Write-Host " FAILED" -ForegroundColor Red
        }
    }
    
    Write-Host ""
    Write-Host "[OK] Recovery complete!" -ForegroundColor Green
}
else {
    Write-Host ""
    Write-Host "[!] pssuspend not found. Manual recovery required." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "    OPTION 1: Download Sysinternals pssuspend" -ForegroundColor White
    Write-Host "    https://docs.microsoft.com/en-us/sysinternals/downloads/pssuspend" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "    Then run for each suspended PID:" -ForegroundColor Gray
    foreach ($proc in $processes) {
        Write-Host "      pssuspend -r $($proc.Id)" -ForegroundColor Gray
    }
    Write-Host ""
    Write-Host "    OPTION 2: Kill and restart Antigravity" -ForegroundColor White
    Write-Host "    This will lose any unsaved work!" -ForegroundColor Red
    Write-Host ""
    Write-Host "    Stop-Process -Name '*Antigravity*' -Force" -ForegroundColor Gray
    Write-Host "    Then restart Antigravity manually." -ForegroundColor Gray
}

Write-Host ""
Write-Host "=" * 60 -ForegroundColor Cyan
Write-Host ""
