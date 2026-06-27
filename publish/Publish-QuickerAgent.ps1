#!/usr/bin/env pwsh
# Build QuickerAgent Windows installer via Electron (NSIS + electron-updater).
#
# Examples:
#   pwsh ./publish/Publish-QuickerAgent.ps1
#   pwsh ./publish/Publish-QuickerAgent.ps1 -SkipQkrpcBuild
#   pwsh ./publish/Publish-QuickerAgent.ps1 -PreflightOnly
#   pwsh ./publish/Publish-QuickerAgent.ps1 -SkipNextBuild
#   pwsh ./publish/Preflight-QuickerAgentFast.ps1
#   pwsh ./publish/Preflight-QuickerAgentBuild.ps1

[CmdletBinding()]
param(
    [string]$RepoRoot = '',
    [switch]$SkipQkrpcBuild,
    # Run electron NSIS build only (no publish/ copy). Used before GitHub Release tag push.
    [switch]$PreflightOnly,
    # Reuse existing .next/standalone (skip pnpm build; run electron-prepare + bundle only).
    [switch]$SkipNextBuild
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

. (Join-Path $PSScriptRoot 'qkrpc-publish-lib.ps1')

if (-not $RepoRoot) {
    $RepoRoot = Split-Path -Parent $PSScriptRoot
}

function Get-QuickerAgentVersionFromJson {
    param([string]$Root)
    $versionFile = Resolve-QuickerRpcVersionJsonPath -MonorepoRoot $Root
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

function Test-NextStandaloneReady {
    param([string]$AgentGuiDir)
    $base = Join-Path $AgentGuiDir '.next\standalone'
    if (Test-Path -LiteralPath (Join-Path $base 'server.js')) { return $true }
    if (Test-Path -LiteralPath (Join-Path $base 'agent-gui\server.js')) { return $true }
    return $false
}

function Resolve-QuickerAgentElectronSetupExe {
    param(
        [string]$DistDir,
        [string]$ExpectedSemVer
    )

    $candidates = @(Get-ChildItem -LiteralPath $DistDir -Filter '*-setup.exe' -ErrorAction SilentlyContinue)
    if ($candidates.Count -eq 0) {
        throw "No NSIS setup.exe found under $DistDir"
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
$expectedSemVer = Get-QuickerAgentVersionFromJson -Root $RepoRoot
$distDir = Join-Path $agentGuiDir 'electron\dist'

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
        pnpm install --frozen-lockfile --config.node-linker=hoisted --config.symlink=false
        if ($LASTEXITCODE -ne 0) { throw "pnpm install failed ($LASTEXITCODE)" }
    }

    Set-QuickerAgentIsolatedUserProfile
    $env:AGENT_GUI_DEFAULT_CWD = $RepoRoot

    if ($SkipNextBuild) {
        if (-not (Test-NextStandaloneReady -AgentGuiDir $agentGuiDir)) {
            throw 'SkipNextBuild set but .next/standalone is missing; run without -SkipNextBuild first.'
        }
        Write-Host 'Skipping next build (reuse .next/standalone)' -ForegroundColor DarkCyan
    }
    else {
        Write-Host 'release gate (fast)...' -ForegroundColor Cyan
        node scripts/preflight-release-gate.mjs
        if ($LASTEXITCODE -ne 0) { throw "preflight-release-gate failed ($LASTEXITCODE)" }

        Write-Host 'next build (production)...' -ForegroundColor Cyan
        pnpm build
        if ($LASTEXITCODE -ne 0) { throw "pnpm build failed ($LASTEXITCODE)" }
    }

    Write-Host 'electron:prepare (stage app + qkrpc + node + shell)...' -ForegroundColor Cyan
    pnpm electron:prepare
    if ($LASTEXITCODE -ne 0) { throw "electron:prepare failed ($LASTEXITCODE)" }

    Write-Host 'electron-builder (NSIS installer + latest.yml)...' -ForegroundColor Cyan
    pnpm exec electron-builder --win nsis
    if ($LASTEXITCODE -ne 0) { throw "electron-builder failed ($LASTEXITCODE)" }

    node scripts/verify-electron-asar.mjs
    if ($LASTEXITCODE -ne 0) { throw "verify-electron-asar failed ($LASTEXITCODE)" }
}
finally {
    Pop-Location
}

if ($PreflightOnly) {
    Write-Host 'Preflight OK: QuickerAgent Electron build succeeded.' -ForegroundColor Green
    exit 0
}

$setupExe = Resolve-QuickerAgentElectronSetupExe -DistDir $distDir -ExpectedSemVer $expectedSemVer
$latestYml = Join-Path $distDir 'latest.yml'
if (-not (Test-Path -LiteralPath $latestYml)) {
    throw "latest.yml not found (required for electron-updater): $latestYml"
}

Assert-QuickerAgentLatestYmlFile -Path $latestYml -ExpectedSemVer $expectedSemVer

$publishOut = Join-Path $RepoRoot 'publish'
New-Item -ItemType Directory -Path $publishOut -Force | Out-Null

$versionJson = Get-Content -LiteralPath (Resolve-QuickerRpcVersionJsonPath -MonorepoRoot $RepoRoot) -Raw | ConvertFrom-Json
$versionedName = Get-QuickerAgentSetupName -Version ([string]$versionJson.QuickerRpc)
$versionedPath = Join-Path $publishOut $versionedName
$aliasPath = Join-Path $publishOut (Get-QkrpcLatestAgentSetupName)
$latestYmlPublish = Join-Path $publishOut 'latest.yml'

Copy-Item -LiteralPath $setupExe.FullName -Destination $versionedPath -Force
Copy-Item -LiteralPath $setupExe.FullName -Destination $aliasPath -Force
Copy-Item -LiteralPath $latestYml -Destination $latestYmlPublish -Force

Write-Host "Setup:    $($setupExe.FullName)" -ForegroundColor Cyan
Write-Host "Copied:   $versionedPath" -ForegroundColor Cyan
Write-Host "Alias:    $aliasPath" -ForegroundColor Cyan
Write-Host "Updater:  $latestYmlPublish" -ForegroundColor Cyan
Write-Host "Endpoint: $(Get-QuickerAgentBitifulLatestYmlUrl)" -ForegroundColor DarkCyan

Write-Host 'Verifying packaged resources (win-unpacked app + node + qkrpc)...' -ForegroundColor Cyan
Push-Location $agentGuiDir
try {
    $distResources = Join-Path $distDir 'win-unpacked\resources'
    node (Join-Path $agentGuiDir 'scripts\verify-desktop-bundle.mjs') `
        --resources-dir $distResources `
        --label electron-dist
    if ($LASTEXITCODE -ne 0) { throw "verify-desktop-bundle failed ($LASTEXITCODE)" }
}
finally {
    Pop-Location
}

Assert-QuickerAgentInstallerFile -Path $aliasPath

exit 0
