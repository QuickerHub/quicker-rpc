#!/usr/bin/env pwsh
# Local QuickerAgent production build (static React/Node + typecheck by default).
# Prerequisites: Node 20+, pnpm. agent-gui/.npmrc uses hoisted + symlink=false (no Windows Developer Mode required).
# Full installer: `Publish-QuickerAgent.ps1` also needs NSIS (electron-builder).
#
# Examples:
#   pwsh ./publish/Build-AgentGuiLocal.ps1
#   pwsh ./publish/Publish-QuickerAgent.ps1   # after this succeeds

[CmdletBinding()]
param(
    [string]$RepoRoot = '',
    [ValidateSet('static', 'legacy-next')]
    [string]$RuntimeMode = 'static',
    [switch]$SkipInstall
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'agent-gui-build-mode.ps1')

if (-not $RepoRoot) {
    $RepoRoot = Split-Path -Parent $PSScriptRoot
}

$agentGui = Join-Path $RepoRoot 'agent-gui'
if (-not (Test-Path -LiteralPath $agentGui)) {
    throw "agent-gui not found: $agentGui"
}

# Keep build-time discovery away from the normal user profile.
if (-not [string]::IsNullOrWhiteSpace($env:TEMP)) {
    $env:USERPROFILE = $env:TEMP
    $env:HOME = $env:TEMP
}
$env:AGENT_GUI_DEFAULT_CWD = $RepoRoot

Push-Location $agentGui
try {
    if (-not $SkipInstall) {
        Write-Host 'pnpm install (hoisted, symlink=false)...' -ForegroundColor Cyan
        if (Test-Path -LiteralPath 'node_modules') {
            Remove-Item -LiteralPath 'node_modules' -Recurse -Force
        }
        pnpm install --frozen-lockfile --config.node-linker=hoisted --config.symlink=false
        if ($LASTEXITCODE -ne 0) { throw "pnpm install failed ($LASTEXITCODE)" }
    }

    Invoke-QuickerAgentSourceBuild -RuntimeMode $RuntimeMode

    Write-Host 'agent-gui production build OK.' -ForegroundColor Green
}
finally {
    Pop-Location
}
