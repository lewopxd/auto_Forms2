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

# Show confirmation prompt
Write-Host ""
Write-Host "========================================" -ForegroundColor Yellow
Write-Host "   GIT COMMIT & PUSH - Confirmacion" -ForegroundColor Yellow
Write-Host "========================================" -ForegroundColor Yellow
Write-Host ""
Write-Host "  Branch:  " -ForegroundColor Cyan -NoNewline
Write-Host $CurrentBranch -ForegroundColor White
Write-Host ""
Write-Host "  Titulo:  " -ForegroundColor Cyan -NoNewline
Write-Host $SafeTitle -ForegroundColor White

if (-not [string]::IsNullOrWhiteSpace($SafeDescription)) {
    Write-Host ""
    Write-Host "  Descripcion:" -ForegroundColor Cyan
    Write-Host "  $SafeDescription" -ForegroundColor Gray
}

Write-Host ""
Write-Host "  Proceder? [S/N]: " -ForegroundColor Yellow -NoNewline

$confirmation = Read-Host
if ($confirmation -notmatch '^[SsYy]$') {
    Write-Host ""
    Write-Host "  X Operacion cancelada" -ForegroundColor Red
    Write-Host ""
    exit 0
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "        EJECUTANDO COMMIT & PUSH" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green

Write-Host ""
Write-Host "  [1/3] Staging cambios..." -ForegroundColor Cyan
$null = git add . 2>&1 | Where-Object { $_ -notmatch "warning:" }
Write-Host "  OK" -ForegroundColor Green

Write-Host ""
Write-Host "  [2/3] Creando commit..." -ForegroundColor Cyan

$output = git commit -m $CommitMsg 2>&1
$commitExitCode = $LASTEXITCODE

if ($commitExitCode -ne 0) {
    if ($output -match "nothing to commit") {
        Write-Host "  ! Sin cambios para commitear" -ForegroundColor Yellow
        exit 0
    }
    else {
        Write-Host "  X Error:" -ForegroundColor Red
        Write-Host $output -ForegroundColor Red
        exit 1
    }
}
$summaryLine = $output | Select-String -Pattern "\d+ file"
if ($summaryLine) {
    Write-Host "  OK: $summaryLine" -ForegroundColor Green
}
else {
    Write-Host "  OK" -ForegroundColor Green
}

Write-Host ""
Write-Host "  [3/3] Push a remoto..." -ForegroundColor Cyan

$output = git push 2>&1
$pushExitCode = $LASTEXITCODE

if ($pushExitCode -ne 0) {
    Write-Host "  X Error:" -ForegroundColor Red
    Write-Host $output -ForegroundColor Red
    exit 1
}
$branchLine = $output | Select-String -Pattern "->"
if ($branchLine) {
    Write-Host "  OK: $branchLine" -ForegroundColor Green
}
else {
    Write-Host "  OK" -ForegroundColor Green
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "         EXITO - Finalizado" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""

exit 0