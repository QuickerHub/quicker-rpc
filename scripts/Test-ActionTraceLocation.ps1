#!/usr/bin/env pwsh
# Fully automated action-trace failureLocation verification (no Quicker required).
# Optional: -IncludeLive runs LiveQuicker tests when Quicker + plugin are available.
param(
    [switch]$IncludeLive,
    [switch]$SkipNode
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot

Write-Host "==> C# offline pipeline (Plugin.Test)" -ForegroundColor Cyan
$filter = 'FullyQualifiedName~ActionTraceLocation|FullyQualifiedName~ActionTracePipeline'
if (-not $IncludeLive) {
    $filter = "$filter&TestCategory!=LiveQuicker"
}

dotnet test (Join-Path $repoRoot 'QuickerRpc.Plugin.Test\QuickerRpc.Plugin.Test.csproj') `
    -c Release `
    --filter $filter `
    --verbosity minimal
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

if ($IncludeLive) {
    Write-Host "==> C# live Quicker integration (LiveQuicker)" -ForegroundColor Cyan
    dotnet test (Join-Path $repoRoot 'QuickerRpc.Plugin.Test\QuickerRpc.Plugin.Test.csproj') `
        -c Release `
        --filter 'TestCategory=LiveQuicker&FullyQualifiedName~ActionTrace|FullyQualifiedName~LiveRun_failing_fixture' `
        --verbosity minimal
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

if ($SkipNode) {
    Write-Host "Skipped agent-gui tests (-SkipNode)." -ForegroundColor Yellow
    exit 0
}

Write-Host "==> agent-gui trace location tests" -ForegroundColor Cyan
Push-Location (Join-Path $repoRoot 'agent-gui')
try {
    if (-not (Test-Path 'node_modules')) {
        pnpm install --frozen-lockfile
        if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    }
    pnpm test:action-trace-location
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
finally {
    Pop-Location
}

Write-Host "All action-trace failureLocation tests passed." -ForegroundColor Green
