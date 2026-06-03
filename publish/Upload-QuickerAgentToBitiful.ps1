#!/usr/bin/env pwsh
# Upload versioned QuickerAgent NSIS installer + version.txt to Bitiful (local network).
#
# Examples:
#   pwsh ./publish/Upload-QuickerAgentToBitiful.ps1 -Tag v0.9.0
#   pwsh ./publish/Upload-QuickerAgentToBitiful.ps1 -Tag v0.9.0 -Version 0.9.0.0

[CmdletBinding()]
param(
    [string]$RepoRoot = '',
    [string]$Tag = '',
    [string]$Version = '',
    [switch]$DryRun
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

. (Join-Path $PSScriptRoot 'qkrpc-publish-lib.ps1')

if (-not $RepoRoot) {
    $RepoRoot = Split-Path -Parent $PSScriptRoot
}

Import-BitifulEnvFromFiles -PublishDir $PSScriptRoot

if (-not (Test-BitifulConfigured)) {
    throw @'
Bitiful credentials not configured.
Copy publish/.env.example to publish/.env and set BITIFUL_ACCESS_KEY, BITIFUL_SECRET_KEY, BITIFUL_BUCKET_NAME.
'@
}

$versionFile = Join-Path $RepoRoot 'version.json'
if (-not $Version) {
    if (-not (Test-Path -LiteralPath $versionFile)) {
        throw "version.json not found: $versionFile"
    }

    $json = Get-Content -LiteralPath $versionFile -Raw | ConvertFrom-Json
    $Version = [string]$json.QuickerRpc
}

$semver = Get-QuickerRpcSemVerFromVersion -Version $Version
if (-not $Tag) {
    $Tag = "v$semver"
}
elseif (-not $Tag.Trim().StartsWith('v')) {
    $Tag = "v$($Tag.Trim())"
}
else {
    $Tag = $Tag.Trim()
}

$setupName = Get-QuickerAgentSetupName -Version $semver
$localInstaller = Join-Path $RepoRoot "publish\$setupName"
$downloadDir = Join-Path $env:TEMP "qkrpc-bitiful-$semver"

function Resolve-InstallerPath {
    if (Test-Path -LiteralPath $localInstaller) {
        Write-Host "Using local installer: $localInstaller" -ForegroundColor Cyan
        return (Resolve-Path -LiteralPath $localInstaller).Path
    }

    if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
        throw @"
Installer not found: $localInstaller
Install GitHub CLI (gh) or place the file under publish/ after Publish-QuickerAgent.ps1 / CI release.
"@
    }

    if (Test-Path -LiteralPath $downloadDir) {
        Remove-Item -LiteralPath $downloadDir -Recurse -Force
    }

    New-Item -ItemType Directory -Path $downloadDir -Force | Out-Null
    Write-Host "Downloading $setupName from GitHub Release $Tag..." -ForegroundColor Cyan

    if ($DryRun) {
        Write-Host "[DryRun] gh release download $Tag --repo QuickerHub/quicker-rpc --pattern $setupName -D $downloadDir" -ForegroundColor DarkGray
        return $localInstaller
    }

    gh release download $Tag --repo 'QuickerHub/quicker-rpc' --pattern $setupName -D $downloadDir
    if ($LASTEXITCODE -ne 0) {
        throw "gh release download failed ($LASTEXITCODE) for $Tag / $setupName"
    }

    $downloaded = Join-Path $downloadDir $setupName
    if (-not (Test-Path -LiteralPath $downloaded)) {
        throw "Downloaded installer missing: $downloaded"
    }

    return (Resolve-Path -LiteralPath $downloaded).Path
}

$installerPath = Resolve-InstallerPath

if ($DryRun) {
    Write-Host "[DryRun] Would upload: $installerPath" -ForegroundColor DarkGray
    Write-Host "[DryRun] version.txt -> $semver" -ForegroundColor DarkGray
    exit 0
}

Invoke-QuickerAgentBitifulUpload -InstallerPath $installerPath -PublishDir $PSScriptRoot

Write-Host ''
Write-Host "Bitiful upload OK ($semver)." -ForegroundColor Green
Write-Host "  Setup: $(Get-QuickerAgentBitifulSetupUrl -Version $semver)" -ForegroundColor Cyan
Write-Host "  version.txt: $(Get-QuickerAgentBitifulVersionTxtUrl)" -ForegroundColor Cyan

exit 0
