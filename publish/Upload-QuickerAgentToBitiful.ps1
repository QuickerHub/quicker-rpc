#!/usr/bin/env pwsh
# Upload versioned QuickerAgent NSIS installer + version.txt + latest.json to Bitiful (local network).
# latest.json is resolved from GitHub Release (or matching local build); stale publish/latest.json is ignored.
#
# Examples:
#   pwsh ./publish/Upload-QuickerAgentToBitiful.ps1 -Tag v0.9.0
#   pwsh ./publish/Upload-QuickerAgentToBitiful.ps1 -Tag v0.9.0 -Version 0.9.0.0

[CmdletBinding()]
param(
    [string]$RepoRoot = '',
    [string]$Tag = '',
    [string]$Version = '',
    [switch]$UseLocal,
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
$downloadDir = Join-Path $env:TEMP "qkrpc-bitiful-$semver-$(Get-Random -Maximum 999999)"

function Resolve-InstallerPath {
    if ($UseLocal) {
        if (-not (Test-Path -LiteralPath $localInstaller)) {
            throw "Local installer not found: $localInstaller"
        }

        Assert-QuickerAgentInstallerFile -Path $localInstaller
        Write-Host "Using local installer (-UseLocal): $localInstaller" -ForegroundColor Cyan
        return (Resolve-Path -LiteralPath $localInstaller).Path
    }

    if ((Test-Path -LiteralPath $localInstaller) -and -not (Test-QuickerAgentInstallerFile -Path $localInstaller)) {
        $sizeMb = [math]::Round((Get-Item -LiteralPath $localInstaller).Length / 1MB, 2)
        Write-Warning "Ignoring stale local installer ($sizeMb MB): $localInstaller"
    }

    if ($DryRun) {
        $url = Get-QuickerAgentPinnedSetupDownloadUrl -Tag $Tag -Version $semver
        Write-Host "[DryRun] Download $url -> $downloadDir\$setupName" -ForegroundColor DarkGray
        if (Test-QuickerAgentInstallerFile -Path $localInstaller) {
            return (Resolve-Path -LiteralPath $localInstaller).Path
        }

        return $localInstaller
    }

    New-Item -ItemType Directory -Path $downloadDir -Force | Out-Null
    $downloaded = Join-Path $downloadDir $setupName

    try {
        return Download-QuickerAgentInstallerFromRelease -Tag $Tag -Version $semver -DestinationPath $downloaded
    }
    catch {
        Write-Warning "Direct download failed: $($_.Exception.Message)"
    }

    if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
        if (Test-QuickerAgentInstallerFile -Path $localInstaller) {
            Write-Warning 'gh not found; falling back to valid local installer.'
            return (Resolve-Path -LiteralPath $localInstaller).Path
        }

        throw @"
Failed to download installer for $Tag.
Install GitHub CLI (gh) or run Publish-QuickerAgent.ps1 locally.
"@
    }

    Write-Host "Retrying via gh release download..." -ForegroundColor Cyan
    gh release download $Tag --repo 'QuickerHub/quicker-rpc' --pattern $setupName -D $downloadDir
    if ($LASTEXITCODE -ne 0) {
        throw "gh release download failed ($LASTEXITCODE) for $Tag / $setupName"
    }

    if (-not (Test-Path -LiteralPath $downloaded)) {
        throw "Downloaded installer missing: $downloaded"
    }

    Assert-QuickerAgentInstallerFile -Path $downloaded
    return (Resolve-Path -LiteralPath $downloaded).Path
}

$installerPath = Resolve-InstallerPath

if (-not (Test-Path -LiteralPath $downloadDir)) {
    New-Item -ItemType Directory -Path $downloadDir -Force | Out-Null
}

$latestJsonPath = Resolve-QuickerAgentLatestJsonForUpload `
    -RepoRoot $RepoRoot `
    -Tag $Tag `
    -ExpectedSemVer $semver `
    -DownloadDir $downloadDir `
    -UseLocal:$UseLocal

if ($DryRun) {
    Write-Host "[DryRun] Would upload: $installerPath" -ForegroundColor DarkGray
    Write-Host "[DryRun] latest.json: $latestJsonPath" -ForegroundColor DarkGray
    Write-Host "[DryRun] version.txt -> $semver" -ForegroundColor DarkGray
    exit 0
}

Invoke-QuickerAgentBitifulUpload `
    -InstallerPath $installerPath `
    -LatestJsonPath $latestJsonPath `
    -ExpectedSemVer $semver `
    -PublishDir $PSScriptRoot

Write-Host ''
Write-Host "Bitiful upload OK ($semver)." -ForegroundColor Green
Write-Host "  Setup: $(Get-QuickerAgentBitifulSetupUrl -Version $semver)" -ForegroundColor Cyan
Write-Host "  version.txt: $(Get-QuickerAgentBitifulVersionTxtUrl)" -ForegroundColor Cyan
Write-Host "  latest.json: $(Get-QuickerAgentBitifulLatestJsonUrl)" -ForegroundColor Cyan

exit 0
