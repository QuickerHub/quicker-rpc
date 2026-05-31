#!/usr/bin/env pwsh
# Build QuickerRpc plugin (qkbuild) and publish qkrpc CLI (publish-rpc.ps1).
# On success, launches the Quicker action that loads/reloads the plugin (quicker:runaction).
# Examples:
#   pwsh ./build.ps1
#   pwsh ./build.ps1 -t
#   pwsh ./build.ps1 -p -n

$ErrorActionPreference = 'Stop'

# Keep in sync with QuickerRpc.Contracts.Rpc.QuickerRpcBootstrap.PluginRunActionId
$PluginRunActionUri = 'quicker:runaction:aa5917ad-1256-4c73-7022-08debe3efcbe'

function Invoke-QuickerRpcPluginRunAction {
    Write-Host "=== QuickerRpc plugin (run action) ===" -ForegroundColor Cyan
    try {
        Start-Process $PluginRunActionUri | Out-Null
        Write-Host "Started: $PluginRunActionUri"
    }
    catch {
        Write-Warning "Could not start Quicker action (is Quicker running / protocol registered?): $_"
    }
}

Push-Location $PSScriptRoot
try {
    Write-Host "=== QuickerRpc.Plugin (qkbuild) ===" -ForegroundColor Cyan
    qkbuild build -c "build.yaml" --project-path ".\QuickerRpc.Plugin" @args
    if ($LASTEXITCODE -ne 0) {
        exit $LASTEXITCODE
    }

    Write-Host "=== qkrpc CLI (publish-rpc.ps1) ===" -ForegroundColor Cyan
    pwsh -NoProfile -File .\publish\publish-rpc.ps1
    if ($LASTEXITCODE -ne 0) {
        exit $LASTEXITCODE
    }

    Invoke-QuickerRpcPluginRunAction
    exit 0
}
finally {
    Pop-Location
}
