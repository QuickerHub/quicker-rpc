#!/usr/bin/env pwsh
# Build QuickerAgent Windows installer via Tauri 2 (replaces legacy Inno/zip pipeline).
#
# Examples:
#   pwsh ./publish/Publish-QuickerAgent.ps1
#   pwsh ./publish/Publish-QuickerAgent.ps1 -SkipQkrpcBuild

[CmdletBinding()]
param(
    [string]$RepoRoot = '',
    [switch]$SkipQkrpcBuild
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

if (-not $SkipQkrpcBuild) {
    Write-Host 'Building qkrpc (publish/cli)...' -ForegroundColor Cyan
    & (Join-Path $PSScriptRoot 'publish-rpc.ps1') -SkipInstall -SkipPackaging
    $cliExe = Join-Path $RepoRoot 'publish\cli\qkrpc.exe'
    if (-not (Test-Path -LiteralPath $cliExe)) {
        throw "qkrpc.exe not found after publish-rpc: $cliExe"
    }
}

Push-Location $agentGuiDir
try {
    if (-not (Test-Path -LiteralPath 'node_modules')) {
        Write-Host 'pnpm install (agent-gui)...' -ForegroundColor Cyan
        pnpm install --frozen-lockfile --config.node-linker=hoisted
        if ($LASTEXITCODE -ne 0) { throw "pnpm install failed ($LASTEXITCODE)" }
    }

    Write-Host 'tauri build (NSIS installer)...' -ForegroundColor Cyan
    pnpm tauri build
    if ($LASTEXITCODE -ne 0) { throw "tauri build failed ($LASTEXITCODE)" }
}
finally {
    Pop-Location
}

$bundleRoot = Join-Path $agentGuiDir 'src-tauri\target\release\bundle'
$publishOut = Join-Path $RepoRoot 'publish'
Write-Host "Bundles: $bundleRoot" -ForegroundColor Green
Get-ChildItem -LiteralPath $bundleRoot -Recurse -Include *.exe,*.msi -ErrorAction SilentlyContinue |
    ForEach-Object {
        Write-Host "  $($_.FullName) ($([math]::Round($_.Length / 1MB, 2)) MB)" -ForegroundColor Cyan
        if ($_.Extension -eq '.exe' -and $_.Name -match 'setup') {
            Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $publishOut $_.Name) -Force
            Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $publishOut 'quicker-agent-win-x64-setup.exe') -Force
        }
    }
Write-Host "Copied setup alias: $publishOut\quicker-agent-win-x64-setup.exe" -ForegroundColor Cyan

Write-Host 'Verifying bundled resources (app + node + qkrpc)...' -ForegroundColor Cyan
Push-Location $agentGuiDir
try {
    $env:VERIFY_BUNDLED = '1'
    node (Join-Path $agentGuiDir 'scripts\verify-tauri-bundle.mjs')
    Remove-Item Env:VERIFY_BUNDLED -ErrorAction SilentlyContinue
    if ($LASTEXITCODE -ne 0) { throw "verify-tauri-bundle failed ($LASTEXITCODE)" }
}
finally {
    Pop-Location
}

$aliasSetup = Join-Path $publishOut 'quicker-agent-win-x64-setup.exe'
if (-not (Test-Path -LiteralPath $aliasSetup)) {
    throw "Installer alias missing: $aliasSetup"
}
$minInstallerBytes = 50MB
if ((Get-Item -LiteralPath $aliasSetup).Length -lt $minInstallerBytes) {
    throw "Installer too small (< 50 MB); app/qkrpc may be missing from bundle."
}

exit 0
