#!/usr/bin/env pwsh
# Build qkrpc single-file setup.exe with Inno Setup 6 (ISCC).
# Requires publish/cli from publish-rpc.ps1.

[CmdletBinding()]
param(
    [string]$RepoRoot = '',
    [string]$SourceDirectory = '',
    [string]$Version = '',
    [switch]$SkipIfMissingCompiler
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

. (Join-Path $PSScriptRoot 'qkrpc-publish-lib.ps1')

if (-not $RepoRoot) {
    $RepoRoot = Split-Path -Parent $PSScriptRoot
}

function Find-InnoSetupCompiler {
    $candidates = @(
        "${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe",
        "$env:ProgramFiles\Inno Setup 6\ISCC.exe"
    )
    foreach ($path in $candidates) {
        if (Test-Path -LiteralPath $path) {
            return $path
        }
    }
    return $null
}

$versionFile = Join-Path $RepoRoot 'version.json'
if (-not (Test-Path -LiteralPath $versionFile)) {
    throw "version.json not found: $versionFile"
}

$versionData = Get-Content -Raw -Path $versionFile | ConvertFrom-Json
$quickerRpcVersion = if ($Version) { $Version.Trim() } else { [string]$versionData.QuickerRpc }
if ([string]::IsNullOrWhiteSpace($quickerRpcVersion)) {
    throw 'version.json missing QuickerRpc string.'
}

$semver = Get-QuickerRpcSemVerFromVersion -Version $quickerRpcVersion
if (-not $SourceDirectory) {
    $SourceDirectory = Join-Path $RepoRoot 'publish\cli'
}

if (-not (Test-Path -LiteralPath (Join-Path $SourceDirectory 'qkrpc.exe'))) {
    throw "qkrpc.exe not found under: $SourceDirectory. Run publish-rpc.ps1 first."
}

$iscc = Find-InnoSetupCompiler
if (-not $iscc) {
    if ($SkipIfMissingCompiler) {
        Write-Warning 'Inno Setup 6 (ISCC.exe) not found; skipping setup.exe build. Install from https://jrsoftware.org/isinfo.php'
        exit 0
    }
    throw @'
Inno Setup 6 not found. Install from https://jrsoftware.org/isinfo.php
Expected ISCC.exe under Program Files (x86)\Inno Setup 6\
'@
}

$issPath = Join-Path $PSScriptRoot 'qkrpc-setup.iss'
$outputDir = Join-Path $RepoRoot 'publish'
$setupName = Get-QuickerRpcCliSetupName -Version $quickerRpcVersion
$setupPath = Join-Path $outputDir $setupName
$latestSetupName = Get-QkrpcLatestCliSetupName
$latestSetupPath = Join-Path $outputDir $latestSetupName

if (Test-Path -LiteralPath $setupPath) {
    Remove-Item -LiteralPath $setupPath -Force
}

Write-Host "Building $setupName with Inno Setup..." -ForegroundColor Cyan
Write-Host "  ISCC: $iscc" -ForegroundColor DarkGray
Write-Host "  Source: $SourceDirectory" -ForegroundColor DarkGray

$defines = @(
    "/DAppVersion=$semver",
    "/DAppVersionFull=$quickerRpcVersion",
    "/DSourceDir=$SourceDirectory",
    "/DOutputDir=$outputDir"
)

& $iscc $issPath @defines
if ($LASTEXITCODE -ne 0) {
    throw "ISCC failed with exit code $LASTEXITCODE"
}

if (-not (Test-Path -LiteralPath $setupPath)) {
    throw "Expected setup output not found: $setupPath"
}

Copy-Item -LiteralPath $setupPath -Destination $latestSetupPath -Force
$sizeMb = [math]::Round((Get-Item -LiteralPath $setupPath).Length / 1MB, 2)
Write-Host "Setup: $setupPath ($sizeMb MB)" -ForegroundColor Green
Write-Host "Latest alias: $latestSetupPath" -ForegroundColor Cyan

exit 0
