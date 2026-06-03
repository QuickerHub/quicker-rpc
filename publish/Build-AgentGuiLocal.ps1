#!/usr/bin/env pwsh
# Local QuickerAgent frontend build (Next standalone + typecheck).
# Prerequisites: Node 20+, pnpm. agent-gui/.npmrc uses hoisted + symlink=false (no Windows Developer Mode required).
# Full installer: `Publish-QuickerAgent.ps1` also needs Rust + NSIS.
#
# Examples:
#   pwsh ./publish/Build-AgentGuiLocal.ps1
#   pwsh ./publish/Publish-QuickerAgent.ps1   # after this succeeds

[CmdletBinding()]
param(
    [string]$RepoRoot = '',
    [switch]$SkipInstall
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if (-not $RepoRoot) {
    $RepoRoot = Split-Path -Parent $PSScriptRoot
}

$agentGui = Join-Path $RepoRoot 'agent-gui'
if (-not (Test-Path -LiteralPath $agentGui)) {
    throw "agent-gui not found: $agentGui"
}

# Avoid webpack scanning Documents/My Pictures (EPERM).
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

    if (Test-Path -LiteralPath '.next') {
        Remove-Item -LiteralPath '.next' -Recurse -Force
    }

    Write-Host 'pnpm build (Next standalone)...' -ForegroundColor Cyan
    pnpm build
    if ($LASTEXITCODE -ne 0) { throw "pnpm build failed ($LASTEXITCODE)" }

    Write-Host 'agent-gui production build OK.' -ForegroundColor Green
}
finally {
    Pop-Location
}
