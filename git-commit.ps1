# =============================================================================
# Git Auto Commit & Push Script (PowerShell)
# Usage: .\git-commit.ps1 -Title "Titulo" -Description "Descripcion" -AI "NombreIA"
# =============================================================================

param(
    [Parameter(Mandatory = $true, Position = 0)]
    [string]$Title,
    
    [Parameter(Mandatory = $false, Position = 1)]
    [string]$Description,
    
    [Parameter(Mandatory = $false, Position = 2)]
    [string]$AI
)

# Set UTF-8 encoding for proper display of special characters
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

function Sanitize-Text {
    param([string]$Text)
    if ([string]::IsNullOrEmpty($Text)) { return "" }
    $sanitized = $Text -replace '[`]', ''
    $sanitized = $sanitized -replace '"', "'"
    $sanitized = $sanitized -replace '[\r\n]+', ' '
    return $sanitized.Trim()
}

$SafeTitle = Sanitize-Text -Text $Title
$SafeDescription = Sanitize-Text -Text $Description
$SafeAI = Sanitize-Text -Text $AI

if ([string]::IsNullOrWhiteSpace($SafeTitle)) {
    Write-Host "Error: Title is required" -ForegroundColor Red
    exit 1
}

# Get current branch
$CurrentBranch = git branch --show-current 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "Error: Could not determine current branch" -ForegroundColor Red
    exit 1
}

# Build commit message
$Body = ""
if (-not [string]::IsNullOrWhiteSpace($SafeAI)) {
    $Body = "[AI: $SafeAI]"
}
if (-not [string]::IsNullOrWhiteSpace($SafeDescription)) {
    if (-not [string]::IsNullOrWhiteSpace($Body)) {
        $Body = "$Body - $SafeDescription"
    }
    else {
        $Body = $SafeDescription
    }
}

if (-not [string]::IsNullOrWhiteSpace($Body)) {
    $CommitMsg = "$SafeTitle - $Body"
}
else {
    $CommitMsg = $SafeTitle
}

# Progress bar helper function
function Show-Progress {
    param([int]$Step, [int]$Total, [string]$Status)
    $barWidth = 30
    $filled = [math]::Floor(($Step / $Total) * $barWidth)
    $empty = $barWidth - $filled
    $bar = ("█" * $filled) + ("░" * $empty)
    $percent = [math]::Floor(($Step / $Total) * 100)
    Write-Host "`r  [$bar] $percent% - $Status" -ForegroundColor Cyan -NoNewline
}

# Show confirmation prompt (compact)
Write-Host "╔══════════════════════════════════════╗" -ForegroundColor Yellow
Write-Host "║   GIT COMMIT & PUSH - Confirmacion   ║" -ForegroundColor Yellow
Write-Host "╠══════════════════════════════════════╣" -ForegroundColor Yellow
Write-Host "║ " -ForegroundColor Yellow -NoNewline
Write-Host "Branch: " -ForegroundColor Cyan -NoNewline
Write-Host ("{0,-29}" -f $CurrentBranch) -ForegroundColor White -NoNewline
Write-Host "║" -ForegroundColor Yellow
Write-Host "║ " -ForegroundColor Yellow -NoNewline
Write-Host "Titulo: " -ForegroundColor Cyan -NoNewline
$displayTitle = if ($SafeTitle.Length -gt 29) { $SafeTitle.Substring(0, 26) + "..." } else { $SafeTitle }
Write-Host ("{0,-29}" -f $displayTitle) -ForegroundColor White -NoNewline
Write-Host "║" -ForegroundColor Yellow
Write-Host "╚══════════════════════════════════════╝" -ForegroundColor Yellow
Write-Host "  Proceder? [S/N]: " -ForegroundColor Yellow -NoNewline

$confirmation = Read-Host
if ($confirmation -notmatch '^[SsYy]$') {
    Write-Host "  ✗ Operacion cancelada" -ForegroundColor Red
    exit 0
}

Write-Host ""
Write-Host "╔══════════════════════════════════════╗" -ForegroundColor Green
Write-Host "║        EJECUTANDO COMMIT & PUSH      ║" -ForegroundColor Green
Write-Host "╚══════════════════════════════════════╝" -ForegroundColor Green

# Step 1: Staging
Show-Progress -Step 0 -Total 3 -Status "Staging cambios..."
$null = git add . 2>&1 | Where-Object { $_ -notmatch "warning:" }
Show-Progress -Step 1 -Total 3 -Status "Stage OK              "
Write-Host ""

# Step 2: Commit
Show-Progress -Step 1 -Total 3 -Status "Creando commit..."
$output = git commit -m $CommitMsg 2>&1
$commitExitCode = $LASTEXITCODE

if ($commitExitCode -ne 0) {
    Write-Host ""
    if ($output -match "nothing to commit") {
        Write-Host "  ! Sin cambios para commitear" -ForegroundColor Yellow
        exit 0
    }
    else {
        Write-Host "  ✗ Error: $output" -ForegroundColor Red
        exit 1
    }
}
$summaryLine = $output | Select-String -Pattern "\d+ file"
$commitInfo = if ($summaryLine) { "Commit OK: $summaryLine" } else { "Commit OK" }
Show-Progress -Step 2 -Total 3 -Status $commitInfo.Substring(0, [math]::Min($commitInfo.Length, 20))
Write-Host ""

# Step 3: Push
Show-Progress -Step 2 -Total 3 -Status "Push a remoto..."
$output = git push 2>&1
$pushExitCode = $LASTEXITCODE

if ($pushExitCode -ne 0) {
    Write-Host ""
    Write-Host "  ✗ Error: $output" -ForegroundColor Red
    exit 1
}
Show-Progress -Step 3 -Total 3 -Status "Push OK               "
Write-Host ""

Write-Host "╔══════════════════════════════════════╗" -ForegroundColor Green
Write-Host "║         ✓ EXITO - Finalizado         ║" -ForegroundColor Green
Write-Host "╚══════════════════════════════════════╝" -ForegroundColor Green

exit 0