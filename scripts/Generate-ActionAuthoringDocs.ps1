#!/usr/bin/env pwsh
# Generate action-authoring docs when sources changed (cli/ + agent/).
param(
    [switch]$Check,
    [switch]$Force,
    [string]$StampPath = ''
)

$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path $PSScriptRoot -Parent
$scriptPath = Join-Path $repoRoot 'scripts/generate-authoring-docs.mjs'

$nodeExe = $env:NODE_EXE
if ([string]::IsNullOrWhiteSpace($nodeExe)) {
    $nodeCmd = Get-Command node -ErrorAction SilentlyContinue
    if ($nodeCmd) {
        $nodeExe = $nodeCmd.Source
    }
}

if ([string]::IsNullOrWhiteSpace($nodeExe) -or -not (Test-Path -LiteralPath $nodeExe)) {
    throw @'
Node.js is required to generate action-authoring docs.
Install Node.js 20+ or set NODE_EXE to node.exe.
'@
}

$nodeArgs = @($scriptPath)
if ($Check) {
    $nodeArgs += '--check'
}
if ($Force) {
    $nodeArgs += '--force'
}
if (-not [string]::IsNullOrWhiteSpace($StampPath)) {
    $nodeArgs += @('--touch', $StampPath)
}

Push-Location $repoRoot
try {
    & $nodeExe @nodeArgs
    if ($LASTEXITCODE -ne 0) {
        exit $LASTEXITCODE
    }
    exit 0
}
finally {
    Pop-Location
}
