#!/usr/bin/env pwsh
# Build QuickerRpc plugin (qkbuild) and publish qkrpc CLI (publish-rpc.ps1).
# Examples:
#   pwsh ./build.ps1
#   pwsh ./build.ps1 -p -n

$ErrorActionPreference = 'Stop'

Push-Location $PSScriptRoot
try {
    Write-Host "=== QuickerRpc.Plugin (qkbuild) ===" -ForegroundColor Cyan
    qkbuild build -c "build.yaml" --project-path ".\QuickerRpc.Plugin" @args
    if ($LASTEXITCODE -ne 0) {
        exit $LASTEXITCODE
    }

    Write-Host "=== qkrpc CLI (publish-rpc.ps1) ===" -ForegroundColor Cyan
    pwsh -NoProfile -File .\publish\publish-rpc.ps1
    exit $LASTEXITCODE
}
finally {
    Pop-Location
}
