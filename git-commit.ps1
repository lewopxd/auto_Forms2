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

# Simple progress display (single line, updates in-place)
function Show-Progress {
    param([int]$Step, [int]$Total, [string]$Status)
    Write-Host "`r  [$Step/$Total] $Status".PadRight(50) -ForegroundColor Cyan -NoNewline
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

# Clear "Proceder?" line (1 line up, overwrite, stay there)
Write-Host "`r".PadRight(60) -NoNewline

# Show executing banner
Write-Host ""
Write-Host "╔══════════════════════════════════════╗" -ForegroundColor Green
Write-Host "║        EJECUTANDO COMMIT & PUSH      ║" -ForegroundColor Green
Write-Host "╚══════════════════════════════════════╝" -ForegroundColor Green
Write-Host ""

# Step 1: Staging
Show-Progress -Step 1 -Total 3 -Status "Staging cambios..."
$null = git add . 2>&1 | Where-Object { $_ -notmatch "warning:" }

# Step 2: Commit
Show-Progress -Step 2 -Total 3 -Status "Creando commit..."
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
$commitDetail = $output | Select-String -Pattern "\d+ insertion|\d+ deletion"

# Step 3: Push
Show-Progress -Step 3 -Total 3 -Status "Push a remoto..."
$output = git push 2>&1
$pushExitCode = $LASTEXITCODE

if ($pushExitCode -ne 0) {
    Write-Host ""
    Write-Host "  ✗ Error: $output" -ForegroundColor Red
    exit 1
}
$pushBranch = ($output | Select-String -Pattern "->").Line

# Clear: progress line (1) + empty (1) + exec banner (3) + empty (1) = 6 lines up
# Move cursor up 5 lines (current is progress line)
[Console]::SetCursorPosition(0, [Console]::CursorTop)
for ($i = 0; $i -lt 5; $i++) {
    [Console]::SetCursorPosition(0, [Console]::CursorTop - 1)
    Write-Host (" " * 60)
}
# Move back up to overwrite
[Console]::SetCursorPosition(0, [Console]::CursorTop - 5)

# Show final summary
Write-Host "  [1/3] Stage    ✓" -ForegroundColor Green
Write-Host "  [2/3] Commit   ✓  " -ForegroundColor Green -NoNewline
Write-Host $commitDetail -ForegroundColor DarkGray
Write-Host "  [3/3] Push     ✓  " -ForegroundColor Green -NoNewline
Write-Host $pushBranch -ForegroundColor DarkGray
Write-Host ""
Write-Host "╔══════════════════════════════════════╗" -ForegroundColor Green
Write-Host "║         ✓ EXITO - Finalizado         ║" -ForegroundColor Green
Write-Host "╚══════════════════════════════════════╝" -ForegroundColor Green

exit 0