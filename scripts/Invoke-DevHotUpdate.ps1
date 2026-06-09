#!/usr/bin/env pwsh
# Dev-supervisor hot update path. This intentionally avoids build.ps1 -t,
# which remains the manual, top-level hot-update entry point.

param(
    [string]$Reason = ''
)

$ErrorActionPreference = 'Stop'

$RepoRoot = Split-Path -Parent $PSScriptRoot
$PluginRunActionUri = 'quicker:runaction:aa5917ad-1256-4c73-7022-08debe3efcbe?plugin'

Push-Location $RepoRoot
try {
    if (-not [string]::IsNullOrWhiteSpace($Reason)) {
        Write-Host "Reason: $Reason" -ForegroundColor DarkGray
    }

    Write-Host "=== Action authoring docs ===" -ForegroundColor Cyan
    pwsh -NoProfile -File .\scripts\Generate-ActionAuthoringDocs.ps1
    if ($LASTEXITCODE -ne 0) {
        exit $LASTEXITCODE
    }

    Write-Host "=== QuickerRpc.Plugin (qkbuild test package) ===" -ForegroundColor Cyan
    & qkbuild build -c build.yaml --project-path .\QuickerRpc.Plugin --test
    if ($LASTEXITCODE -ne 0) {
        Write-Host "qkbuild failed (exit $LASTEXITCODE)." -ForegroundColor Red
        exit $LASTEXITCODE
    }

    Write-Host "=== qkrpc CLI (dev publish) ===" -ForegroundColor Cyan
    pwsh -NoProfile -File .\publish\publish-rpc.ps1 -SkipPackaging -SkipInstall
    if ($LASTEXITCODE -ne 0) {
        exit $LASTEXITCODE
    }

    Write-Host "=== QuickerRpc plugin (run action) ===" -ForegroundColor Cyan
    try {
        Start-Process $PluginRunActionUri | Out-Null
        Write-Host "Started: $PluginRunActionUri"
    }
    catch {
        Write-Warning "Could not start Quicker action (is Quicker running / protocol registered?): $_"
    }

    exit 0
}
finally {
    Pop-Location
}
