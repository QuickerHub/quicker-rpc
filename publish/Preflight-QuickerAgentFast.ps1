#!/usr/bin/env pwsh
# Fast release gate (<10s): launcher contracts + version notes. No build.
#
# Examples:
#   pwsh ./publish/Preflight-QuickerAgentFast.ps1
#   pwsh ./publish/Preflight-QuickerAgentFast.ps1 -RustShortcutTest

[CmdletBinding()]
param(
    [string]$RepoRoot = '',
    [switch]$RustShortcutTest
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if (-not $RepoRoot) {
    $RepoRoot = Split-Path -Parent $PSScriptRoot
}

$agentGuiDir = Join-Path $RepoRoot 'agent-gui'
if (-not (Test-Path -LiteralPath $agentGuiDir)) {
    throw "agent-gui not found: $agentGuiDir"
}

if ($RustShortcutTest) {
    $env:PREFLIGHT_RUST = '1'
}

Push-Location $agentGuiDir
try {
    node (Join-Path $agentGuiDir 'scripts\preflight-release-gate.mjs')
    if ($LASTEXITCODE -ne 0) {
        throw "preflight-release-gate failed ($LASTEXITCODE)"
    }
}
finally {
    Remove-Item Env:PREFLIGHT_RUST -ErrorAction SilentlyContinue
    Pop-Location
}

Write-Host 'Fast preflight OK.' -ForegroundColor Green
