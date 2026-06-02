#!/usr/bin/env pwsh
# Build QuickerAgent Windows installer via Tauri 2 (replaces legacy Inno/zip pipeline).
#
# Examples:
#   pwsh ./publish/Publish-QuickerAgent.ps1
#   pwsh ./publish/Publish-QuickerAgent.ps1 -SkipQkrpcBuild
#
# Bundled LLM key (obfuscated into installer, not stored in git):
#   $env:BUNDLED_LLM_AI98PRO_API_KEY = 'sk-...'
#   pwsh ./publish/Publish-QuickerAgent.ps1

[CmdletBinding()]
param(
    [string]$RepoRoot = '',
    [switch]$SkipQkrpcBuild
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

. (Join-Path $PSScriptRoot 'qkrpc-publish-lib.ps1')

if (-not $RepoRoot) {
    $RepoRoot = Split-Path -Parent $PSScriptRoot
}

function Get-QuickerAgentVersionFromJson {
    param([string]$Root)
    $versionFile = Join-Path $Root 'version.json'
    if (-not (Test-Path -LiteralPath $versionFile)) {
        throw "version.json not found: $versionFile"
    }
    $json = Get-Content -LiteralPath $versionFile -Raw | ConvertFrom-Json
    $version = $json.QuickerRpc
    if ([string]::IsNullOrWhiteSpace($version)) {
        throw "version.json missing 'QuickerRpc' key"
    }
    return Get-QuickerRpcSemVerFromVersion -Version $version.ToString().Trim()
}

function Resolve-QuickerAgentSetupExe {
    param(
        [string]$BundleRoot,
        [string]$ExpectedSemVer
    )

    $candidates = @(Get-ChildItem -LiteralPath $BundleRoot -Recurse -Filter '*setup*.exe' -ErrorAction SilentlyContinue)
    if ($candidates.Count -eq 0) {
        throw "No NSIS setup.exe found under $BundleRoot"
    }

    foreach ($setup in $candidates) {
        Write-Host "  $($setup.FullName) ($([math]::Round($setup.Length / 1MB, 2)) MB)" -ForegroundColor DarkCyan
    }

    $versioned = @($candidates | Where-Object { $_.Name -match [regex]::Escape($ExpectedSemVer) })
    if ($versioned.Count -ge 1) {
        return ($versioned | Sort-Object LastWriteTime -Descending | Select-Object -First 1)
    }

    Write-Warning "No setup.exe name contains version $ExpectedSemVer; using newest by LastWriteTime."
    return ($candidates | Sort-Object LastWriteTime -Descending | Select-Object -First 1)
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
    if (-not (Test-Path -LiteralPath 'node_modules') -or $env:CI -eq 'true') {
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
$expectedSemVer = Get-QuickerAgentVersionFromJson -Root $RepoRoot
Write-Host "Bundles: $bundleRoot (expect $expectedSemVer)" -ForegroundColor Green

$setupExe = Resolve-QuickerAgentSetupExe -BundleRoot $bundleRoot -ExpectedSemVer $expectedSemVer
$versionJson = Get-Content -LiteralPath (Join-Path $RepoRoot 'version.json') -Raw | ConvertFrom-Json
$versionedName = Get-QuickerAgentSetupName -Version ([string]$versionJson.QuickerRpc)
$versionedPath = Join-Path $publishOut $versionedName
$aliasPath = Join-Path $publishOut (Get-QkrpcLatestAgentSetupName)

Copy-Item -LiteralPath $setupExe.FullName -Destination $versionedPath -Force
Copy-Item -LiteralPath $setupExe.FullName -Destination $aliasPath -Force
Write-Host "Setup:    $($setupExe.FullName)" -ForegroundColor Cyan
Write-Host "Copied:   $versionedPath" -ForegroundColor Cyan
Write-Host "Alias:    $aliasPath" -ForegroundColor Cyan

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

if (-not (Test-Path -LiteralPath $aliasPath)) {
    throw "Installer alias missing: $aliasPath"
}
$minInstallerBytes = 50MB
$aliasItem = Get-Item -LiteralPath $aliasPath
if ($aliasItem.Length -lt $minInstallerBytes) {
    throw "Installer too small (< 50 MB); app/qkrpc may be missing from bundle."
}
if ($aliasItem.LastWriteTime -ne $setupExe.LastWriteTime -or $aliasItem.Length -ne $setupExe.Length) {
    throw "Alias mismatch after copy: $aliasPath"
}

exit 0
