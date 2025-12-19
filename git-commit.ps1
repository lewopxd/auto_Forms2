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

Write-Host ""
Write-Host "==================================================" -ForegroundColor Yellow
Write-Host "  Git Auto Commit & Push" -ForegroundColor Yellow
Write-Host "==================================================" -ForegroundColor Yellow

Write-Host ""
Write-Host "[1/3] Staging all changes..." -ForegroundColor Cyan
git add .

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

Write-Host ""
Write-Host "Commit message:" -ForegroundColor Gray
Write-Host "  $CommitMsg" -ForegroundColor White

Write-Host ""
Write-Host "[2/3] Creating commit..." -ForegroundColor Cyan

$output = git commit -m $CommitMsg 2>&1
$commitExitCode = $LASTEXITCODE

if ($commitExitCode -ne 0) {
    if ($output -match "nothing to commit") {
        Write-Host "Info: Nothing to commit, working tree clean" -ForegroundColor Yellow
        exit 0
    }
    else {
        Write-Host "Error during commit:" -ForegroundColor Red
        Write-Host $output -ForegroundColor Red
        exit 1
    }
}
Write-Host $output -ForegroundColor Gray

Write-Host ""
Write-Host "[3/3] Pushing to remote..." -ForegroundColor Cyan

$output = git push 2>&1
$pushExitCode = $LASTEXITCODE

if ($pushExitCode -ne 0) {
    Write-Host "Error during push:" -ForegroundColor Red
    Write-Host $output -ForegroundColor Red
    exit 1
}
Write-Host $output -ForegroundColor Gray

Write-Host ""
Write-Host "==================================================" -ForegroundColor Green
Write-Host "  OK - Commit y push completados!" -ForegroundColor Green
Write-Host "==================================================" -ForegroundColor Green
Write-Host ""
Write-Host "[SUCCESS] Tarea completada exitosamente. Cerrando..." -ForegroundColor Green
Write-Host ""

# Salida exitosa - el script se cierra automaticamente
exit 0
