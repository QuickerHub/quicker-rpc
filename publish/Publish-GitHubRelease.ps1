#!/usr/bin/env pwsh
# Create a GitHub Release for qkrpc CLI (zip asset).
# Quicker plugin zip still uses qkbuild -p locally; this script only ships the CLI.
#
# Examples:
#   pwsh ./publish/Publish-GitHubRelease.ps1
#   pwsh ./publish/Publish-GitHubRelease.ps1 -SkipBuild
#   pwsh ./publish/Publish-GitHubRelease.ps1 -DryRun

[CmdletBinding()]
param(
    [string]$RepoRoot = '',
    [string]$TagVersion = '',
    [string]$Commitish = 'HEAD',
    [string]$ReleaseTitle = '',
    [switch]$SkipBuild,
    [switch]$SkipTag,
    [switch]$Draft,
    [switch]$DryRun
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

. (Join-Path $PSScriptRoot 'qkrpc-publish-lib.ps1')

if (-not $RepoRoot) {
    $RepoRoot = Split-Path -Parent $PSScriptRoot
}

$versionFile = Join-Path $RepoRoot 'version.json'
if (-not (Test-Path -LiteralPath $versionFile)) {
    throw "version.json not found: $versionFile"
}

$versionData = Get-Content -Raw -Path $versionFile | ConvertFrom-Json
$quickerRpcVersion = [string]$versionData.QuickerRpc
if ([string]::IsNullOrWhiteSpace($quickerRpcVersion)) {
    throw "version.json missing QuickerRpc string."
}

$semantic = if ($TagVersion) {
    Get-QuickerRpcSemVerFromVersion -Version $TagVersion
}
else {
    Get-QuickerRpcSemVerFromVersion -Version $quickerRpcVersion
}

$tagName = "v$semantic"
$zipName = Get-QuickerRpcCliZipName -Version $semantic
$zipPath = Join-Path $RepoRoot "publish\$zipName"
$latestZipPath = Join-Path $RepoRoot "publish\$((Get-QkrpcLatestCliZipName))"
$installScriptPath = Join-Path $RepoRoot 'publish\install.ps1'
$installOneLiner = '$p="$env:TEMP\qkrpc-install.ps1"; iwr https://github.com/QuickerHub/quicker-rpc/releases/latest/download/install.ps1 -OutFile $p -UseBasicParsing; & $p'

if (-not $ReleaseTitle) {
    $ReleaseTitle = "qkrpc $tagName"
}

function Assert-GhAvailable {
    if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
        throw 'GitHub CLI (gh) not found. Install from https://cli.github.com/ and run gh auth login.'
    }
}

function Get-ReleaseAssetPaths {
    if (-not (Test-Path -LiteralPath $zipPath)) {
        throw @"
CLI release zip not found: $zipPath
Run publish-rpc.ps1 first (or omit -SkipBuild).
"@
    }

    if (-not (Test-Path -LiteralPath $latestZipPath)) {
        throw "Latest CLI zip alias not found: $latestZipPath"
    }

    if (-not (Test-Path -LiteralPath $installScriptPath)) {
        throw "install.ps1 not found: $installScriptPath"
    }

    return @($zipPath, $latestZipPath, $installScriptPath)
}

function New-ReleaseNotesBody {
    param([string]$Tag, [string]$VersionFull)

    return @"
## qkrpc $Tag

CLI client for [quicker-rpc](https://github.com/QuickerHub/quicker-rpc) (version.json: ``$VersionFull``).

### Install (one command)

``````powershell
$p="$env:TEMP\qkrpc-install.ps1"; iwr https://github.com/QuickerHub/quicker-rpc/releases/latest/download/install.ps1 -OutFile $p -UseBasicParsing; & $p
``````

Pin this version:

``````powershell
$p="$env:TEMP\qkrpc-install.ps1"; iwr https://github.com/QuickerHub/quicker-rpc/releases/download/$Tag/install.ps1 -OutFile $p -UseBasicParsing; & $p
``````

### Verify

``````powershell
qkrpc ping --json
``````

Quicker plugin package is published separately via Quicker dependency **quicker.rpc**.
"@
}

Assert-GhAvailable

if (-not $SkipBuild) {
    $publishScript = Join-Path $RepoRoot 'publish\publish-rpc.ps1'
    if (-not (Test-Path -LiteralPath $publishScript)) {
        throw "publish-rpc.ps1 not found: $publishScript"
    }

    if ($DryRun) {
        Write-Host "[DryRun] pwsh -NoProfile -File $publishScript -SkipInstall" -ForegroundColor DarkGray
    }
    else {
        & pwsh -NoProfile -File $publishScript -SkipInstall
        if ($LASTEXITCODE -ne 0) {
            throw "publish-rpc.ps1 failed with exit code $LASTEXITCODE"
        }
    }
}

if ($DryRun) {
    Write-Host "[DryRun] Expect assets: $zipPath, $installScriptPath" -ForegroundColor DarkGray
    $assetPaths = @($zipPath, $installScriptPath)
}
else {
    $assetPaths = @(Get-ReleaseAssetPaths)
}

$notesBody = New-ReleaseNotesBody -Tag $tagName -VersionFull $quickerRpcVersion
$notesPath = Join-Path $env:TEMP "qkrpc-release-notes-$tagName.md"
Set-Content -LiteralPath $notesPath -Value $notesBody -Encoding utf8NoBOM

$tagMessage = "Release $tagName (QuickerRpc $quickerRpcVersion)"

if (-not $SkipTag) {
    $tagCheck = git -C $RepoRoot tag -l $tagName
    if ($tagCheck) {
        throw "Tag already exists: $tagName. Delete it or use -SkipTag if the tag is already on remote."
    }

    if ($DryRun) {
        Write-Host "[DryRun] git -C $RepoRoot tag -a $tagName $Commitish -m `"$tagMessage`"" -ForegroundColor DarkGray
        Write-Host "[DryRun] git -C $RepoRoot push origin refs/tags/$tagName" -ForegroundColor DarkGray
    }
    else {
        git -C $RepoRoot tag -a $tagName $Commitish -m $tagMessage
        git -C $RepoRoot push origin "refs/tags/$tagName"
    }
}
else {
    Write-Host "SkipTag: not creating or pushing tag (ensure $tagName exists on remote)." -ForegroundColor Yellow
}

$ghArgs = @(
    'release', 'create', $tagName,
    '--title', $ReleaseTitle,
    '--notes-file', $notesPath
)
$ghArgs += $assetPaths
if ($Draft) {
    $ghArgs += '--draft'
}

if ($DryRun) {
    Write-Host "[DryRun] gh $($ghArgs -join ' ')" -ForegroundColor DarkGray
    Write-Host '[DryRun] Done.' -ForegroundColor DarkGray
    exit 0
}

$prevEap = $ErrorActionPreference
$ErrorActionPreference = 'SilentlyContinue'
try {
    gh release view $tagName 2>$null | Out-Null
    $releaseExists = $LASTEXITCODE -eq 0
}
finally {
    $ErrorActionPreference = $prevEap
}

if ($releaseExists) {
    Write-Host "Release $tagName already exists; uploading assets..." -ForegroundColor Yellow
    gh release upload $tagName @assetPaths --clobber
}
else {
    gh @ghArgs
}

if ($LASTEXITCODE -ne 0) {
    throw "gh release failed with exit code $LASTEXITCODE"
}

Write-Host ''
Write-Host "Release completed: $tagName" -ForegroundColor Green
Write-Host "Assets: $($assetPaths -join ', ')" -ForegroundColor Cyan
Write-Host ''
Write-Host 'Users can install with:' -ForegroundColor Yellow
Write-Host "  $installOneLiner"
