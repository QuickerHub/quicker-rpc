#!/usr/bin/env pwsh
# Medium preflight: fast gate + selected production app + staged bundle verify.
# Skips NSIS compile; static React/Node is the default production runtime.
#
# Examples:
#   pwsh ./publish/Preflight-QuickerAgentBuild.ps1
#   pwsh ./publish/Preflight-QuickerAgentBuild.ps1 -SkipAppBuild
#   pwsh ./publish/Preflight-QuickerAgentBuild.ps1 -RuntimeMode legacy-next

[CmdletBinding()]
param(
    [string]$RepoRoot = '',
    [ValidateSet('static', 'legacy-next')]
    [string]$RuntimeMode = 'static',
    [Alias('SkipNextBuild')]
    [switch]$SkipAppBuild,
    [switch]$SkipQkrpcBuild
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

. (Join-Path $PSScriptRoot 'qkrpc-publish-lib.ps1')
. (Join-Path $PSScriptRoot 'agent-gui-build-mode.ps1')

if (-not $RepoRoot) {
    $RepoRoot = Split-Path -Parent $PSScriptRoot
}

$agentGuiDir = Join-Path $RepoRoot 'agent-gui'
if (-not (Test-Path -LiteralPath $agentGuiDir)) {
    throw "agent-gui not found: $agentGuiDir"
}

& pwsh -NoProfile -File (Join-Path $PSScriptRoot 'Preflight-QuickerAgentFast.ps1') -RepoRoot $RepoRoot
if ($LASTEXITCODE -ne 0) {
    throw "fast preflight failed ($LASTEXITCODE)"
}

if (-not $SkipQkrpcBuild) {
    Write-Host 'Building qkrpc (publish/cli) for electron-prepare...' -ForegroundColor Cyan
    & (Join-Path $PSScriptRoot 'publish-rpc.ps1') -SkipInstall -SkipPackaging
    $cliExe = Join-Path $RepoRoot 'publish\cli\qkrpc.exe'
    if (-not (Test-Path -LiteralPath $cliExe)) {
        throw "qkrpc.exe not found after publish-rpc: $cliExe"
    }
}

Push-Location $agentGuiDir
try {
    Set-QuickerAgentIsolatedUserProfile

    Invoke-QuickerAgentElectronPrepare -RuntimeMode $RuntimeMode -SkipAppBuild:$SkipAppBuild

    Write-Host 'verify staged bundle...' -ForegroundColor Cyan
    $resourcesDir = Join-Path $agentGuiDir 'electron\resources'
    node scripts/verify-desktop-bundle.mjs --resources-dir $resourcesDir --label electron-staged
    if ($LASTEXITCODE -ne 0) { throw "verify-desktop-bundle failed ($LASTEXITCODE)" }
}
finally {
    Pop-Location
}

Write-Host 'Build preflight OK (no NSIS compile).' -ForegroundColor Green
