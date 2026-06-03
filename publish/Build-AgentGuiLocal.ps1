#!/usr/bin/env pwsh
# Local QuickerAgent frontend build (Next standalone + typecheck).
# Prerequisites on Windows:
#   - Enable Developer Mode (Settings > Privacy & security > For developers), OR run this shell as Administrator
#   - Node 20+, pnpm, Rust (only for full `Publish-QuickerAgent.ps1`)
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

function Test-CanCreateSymlink {
    $dir = Join-Path $env:TEMP "qkrpc-symlink-probe"
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
    $target = Join-Path $dir 'target.txt'
    Set-Content -LiteralPath $target -Value 'x' -Encoding ascii
    $link = Join-Path $dir 'link.txt'
    try {
        if (Test-Path -LiteralPath $link) { Remove-Item -LiteralPath $link -Force }
        New-Item -ItemType SymbolicLink -Path $link -Target $target -Force | Out-Null
        return $true
    }
    catch {
        return $false
    }
    finally {
        Remove-Item -LiteralPath $dir -Recurse -Force -ErrorAction SilentlyContinue
    }
}

if (-not (Test-CanCreateSymlink)) {
    throw @"
Windows cannot create symlinks in this session (Next.js standalone needs them).

Fix one of:
  1. Settings > Privacy & security > For developers > enable Developer Mode
  2. Run PowerShell as Administrator, then re-run this script

After that: pwsh ./publish/Build-AgentGuiLocal.ps1
"@
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
