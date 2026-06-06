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
    [switch]$SkipQkrpcBuild,
    # Run pnpm tauri build only (no publish/ copy / verify). Used before GitHub Release tag push.
    [switch]$PreflightOnly,
    # Reuse existing .next/standalone (skip pnpm build; run tauri-prepare + tauri bundle only).
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

function Sync-TauriConfigVersion {
    param(
        [string]$AgentGuiRoot,
        [string]$SemVer
    )

    $confPath = Join-Path $AgentGuiRoot 'src-tauri\tauri.conf.json'
    if (-not (Test-Path -LiteralPath $confPath)) {
        throw "tauri.conf.json not found: $confPath"
    }

    $conf = Get-Content -LiteralPath $confPath -Raw | ConvertFrom-Json
    $current = [string]$conf.version
    if ($current -eq $SemVer) {
        Write-Host "tauri.conf.json version already $SemVer" -ForegroundColor DarkCyan
        return
    }

    $conf.version = $SemVer
    $json = $conf | ConvertTo-Json -Depth 100
    Set-Content -LiteralPath $confPath -Value ($json + "`n") -Encoding utf8NoBOM
    Write-Host "tauri.conf.json version -> $SemVer" -ForegroundColor Green
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

function Test-NextStandaloneReady {
    param([string]$AgentGuiDir)
    $base = Join-Path $AgentGuiDir '.next\standalone'
    if (Test-Path -LiteralPath (Join-Path $base 'server.js')) { return $true }
    if (Test-Path -LiteralPath (Join-Path $base 'agent-gui\server.js')) { return $true }
    return $false
}

function Invoke-QuickerAgentStagedTauriBuild {
    param(
        [string]$AgentGuiDir,
        [string]$PublishDir,
        [switch]$SkipNextBuild
    )

    Push-Location $AgentGuiDir
    try {
        Set-QuickerAgentIsolatedUserProfile

        if ($SkipNextBuild) {
            if (-not (Test-NextStandaloneReady -AgentGuiDir $AgentGuiDir)) {
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

        $confPath = Join-Path $AgentGuiDir 'src-tauri\tauri.conf.json'
        $conf = Get-Content -LiteralPath $confPath -Raw | ConvertFrom-Json
        $savedBeforeBuild = [string]$conf.build.beforeBuildCommand
        $conf.build.beforeBuildCommand = ''
        Set-Content -LiteralPath $confPath -Value (($conf | ConvertTo-Json -Depth 100) + "`n") -Encoding utf8NoBOM
        try {
            Write-Host 'tauri build (NSIS installer + updater artifacts)...' -ForegroundColor Cyan
            Import-TauriSigningPrivateKey -PublishDir $PublishDir
            $env:CI = 'true'
            pnpm tauri build
            if ($LASTEXITCODE -ne 0) { throw "tauri build failed ($LASTEXITCODE)" }
        }
        finally {
            $conf.build.beforeBuildCommand = $savedBeforeBuild
            Set-Content -LiteralPath $confPath -Value (($conf | ConvertTo-Json -Depth 100) + "`n") -Encoding utf8NoBOM
        }
    }
    finally {
        Pop-Location
    }
}

$agentGuiDir = Join-Path $RepoRoot 'agent-gui'
if (-not (Test-Path -LiteralPath $agentGuiDir)) {
    throw "agent-gui not found: $agentGuiDir"
}
$expectedSemVer = Get-QuickerAgentVersionFromJson -Root $RepoRoot
Sync-TauriConfigVersion -AgentGuiRoot $agentGuiDir -SemVer $expectedSemVer

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
        pnpm install --frozen-lockfile --config.node-linker=hoisted --config.symlink=false
        if ($LASTEXITCODE -ne 0) { throw "pnpm install failed ($LASTEXITCODE)" }
    }
}
finally {
    Pop-Location
}

Invoke-QuickerAgentStagedTauriBuild -AgentGuiDir $agentGuiDir -PublishDir $PSScriptRoot -SkipNextBuild:$SkipNextBuild

if ($PreflightOnly) {
    Write-Host 'Preflight OK: QuickerAgent Tauri build succeeded.' -ForegroundColor Green
    exit 0
}

$bundleRoot = Join-Path $agentGuiDir 'src-tauri\target\release\bundle'
$publishOut = Join-Path $RepoRoot 'publish'
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

$latestJsonPath = Join-Path $publishOut 'latest.json'
Write-QuickerAgentUpdaterLatestJson -SetupExePath $setupExe.FullName -SemVer $expectedSemVer -DestinationPath $latestJsonPath | Out-Null
Write-Host "Updater:  $latestJsonPath" -ForegroundColor Cyan
Write-Host "Endpoint: $(Get-QuickerAgentBitifulLatestJsonUrl)" -ForegroundColor DarkCyan

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
