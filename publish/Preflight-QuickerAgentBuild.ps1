#!/usr/bin/env pwsh
# Medium preflight (~3–8 min): fast gate + next build + tauri-prepare + staged bundle verify.
# Skips Rust/NSIS compile — catches most release-only Next/bundle issues without full Tauri build.
#
# Examples:
#   pwsh ./publish/Preflight-QuickerAgentBuild.ps1
#   pwsh ./publish/Preflight-QuickerAgentBuild.ps1 -SkipNextBuild

[CmdletBinding()]
param(
    [string]$RepoRoot = '',
    [switch]$SkipNextBuild,
    [switch]$SkipQkrpcBuild
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

. (Join-Path $PSScriptRoot 'qkrpc-publish-lib.ps1')

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
    Write-Host 'Building qkrpc (publish/cli) for tauri-prepare...' -ForegroundColor Cyan
    & (Join-Path $PSScriptRoot 'publish-rpc.ps1') -SkipInstall -SkipPackaging
    $cliExe = Join-Path $RepoRoot 'publish\cli\qkrpc.exe'
    if (-not (Test-Path -LiteralPath $cliExe)) {
        throw "qkrpc.exe not found after publish-rpc: $cliExe"
    }
}

function Test-NextStandaloneReady {
    param([string]$AgentGuiDir)
    $base = Join-Path $AgentGuiDir '.next\standalone'
    if (Test-Path -LiteralPath (Join-Path $base 'server.js')) { return $true }
    if (Test-Path -LiteralPath (Join-Path $base 'agent-gui\server.js')) { return $true }
    return $false
}

Push-Location $agentGuiDir
try {
    Set-QuickerAgentIsolatedUserProfile

    if ($SkipNextBuild) {
        if (-not (Test-NextStandaloneReady -AgentGuiDir $agentGuiDir)) {
            throw 'SkipNextBuild set but .next/standalone is missing; run without -SkipNextBuild first.'
        }
        Write-Host 'Skipping next build (reuse .next/standalone)' -ForegroundColor DarkCyan
    }
    else {
        Write-Host 'next build (production)...' -ForegroundColor Cyan
        pnpm build
        if ($LASTEXITCODE -ne 0) { throw "pnpm build failed ($LASTEXITCODE)" }
    }

    Write-Host 'tauri-prepare (stage app + qkrpc + node)...' -ForegroundColor Cyan
    node scripts/tauri-prepare.mjs
    if ($LASTEXITCODE -ne 0) { throw "tauri-prepare failed ($LASTEXITCODE)" }

    Write-Host 'verify staged bundle...' -ForegroundColor Cyan
    node scripts/verify-tauri-bundle.mjs
    if ($LASTEXITCODE -ne 0) { throw "verify-tauri-bundle failed ($LASTEXITCODE)" }
}
finally {
    Pop-Location
}

Write-Host 'Build preflight OK (no Tauri/NSIS compile).' -ForegroundColor Green
