#!/usr/bin/env pwsh
# Upload voice-asr runtime + model zips to Bitiful (domestic CDN for QuickerAgent one-click install).
#
# Runtime is versioned; model uses a fixed filename (no version in object key).
#
# Examples:
#   pwsh ./publish/Upload-VoiceAsrToBitiful.ps1 -Version 0.1.1
#   pwsh ./publish/Upload-VoiceAsrToBitiful.ps1 -Version 0.1.1 -UseLocalVoiceRoot
#   pwsh ./publish/Upload-VoiceAsrToBitiful.ps1 -Version 0.1.1 -PublishModel

[CmdletBinding()]
param(
    [string]$RepoRoot = '',
    [string]$Version = '0.1.0',
    [string]$RuntimeTag = '',
    [string]$ModelTag = 'model-sensevoice',
    [switch]$UseLocalVoiceRoot,
    [switch]$PublishModel,
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

$Version = $Version.Trim()
if (-not $Version) {
    throw 'Version is required.'
}

if (-not $RuntimeTag) {
    $RuntimeTag = "v$Version"
}
else {
    $RuntimeTag = $RuntimeTag.Trim()
    if (-not $RuntimeTag.StartsWith('v')) {
        $RuntimeTag = "v$RuntimeTag"
    }
}

$VoiceRoot = Join-Path $RepoRoot 'voice-asr-runtime'
$PublishDir = Join-Path $VoiceRoot 'publish'
$RuntimeZipName = Get-VoiceAsrRuntimeZipName -Version $Version
$ModelZipName = Get-VoiceAsrModelZipName
$RuntimeZip = Join-Path $PublishDir $RuntimeZipName
$ModelZip = Join-Path $PublishDir $ModelZipName

function Resolve-VoiceAsrAsset {
    param(
        [string]$LocalPath,
        [string]$AssetName,
        [string]$Tag
    )

    if ($UseLocalVoiceRoot -and (Test-Path -LiteralPath $LocalPath)) {
        Write-Host "Using local asset: $LocalPath" -ForegroundColor Cyan
        return (Resolve-Path -LiteralPath $LocalPath).Path
    }

    if (Test-Path -LiteralPath $LocalPath) {
        return (Resolve-Path -LiteralPath $LocalPath).Path
    }

    if ($DryRun) {
        $url = "https://github.com/QuickerHub/voice-asr-runtime/releases/download/$Tag/$AssetName"
        Write-Host "[DryRun] Would download $url" -ForegroundColor DarkGray
        return $LocalPath
    }

    if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
        throw "Missing $LocalPath and gh is not installed."
    }

    New-Item -ItemType Directory -Path $PublishDir -Force | Out-Null
    Write-Host "Downloading $AssetName from GitHub release $Tag..." -ForegroundColor Cyan
    gh release download $Tag --repo 'QuickerHub/voice-asr-runtime' --pattern $AssetName -D $PublishDir
    if ($LASTEXITCODE -ne 0) {
        throw "gh release download failed ($LASTEXITCODE) for $Tag / $AssetName"
    }

    if (-not (Test-Path -LiteralPath $LocalPath)) {
        throw "Downloaded asset missing: $LocalPath"
    }

    return (Resolve-Path -LiteralPath $LocalPath).Path
}

$runtimePath = Resolve-VoiceAsrAsset -LocalPath $RuntimeZip -AssetName $RuntimeZipName -Tag $RuntimeTag

if ($DryRun) {
    Write-Host "[DryRun] Would upload runtime: $runtimePath" -ForegroundColor DarkGray
    if ($PublishModel) {
        Write-Host "[DryRun] Would upload model from $ModelTag" -ForegroundColor DarkGray
    }
    Write-Host "[DryRun] version.txt -> $Version" -ForegroundColor DarkGray
    Write-Host "  runtime URL: $(Get-VoiceAsrBitifulAssetUrl -FileName $RuntimeZipName)" -ForegroundColor DarkGray
    Write-Host "  model URL:   $(Get-VoiceAsrBitifulAssetUrl -FileName $ModelZipName)" -ForegroundColor DarkGray
    exit 0
}

$uploadParams = @{
    RuntimeZipPath = $runtimePath
    Version        = $Version
    PublishDir     = $PSScriptRoot
}
if ($PublishModel) {
    $uploadParams.PublishModel = $true
    $uploadParams.ModelZipPath = Resolve-VoiceAsrAsset -LocalPath $ModelZip -AssetName $ModelZipName -Tag $ModelTag
}
Invoke-VoiceAsrBitifulUpload @uploadParams

Write-Host ''
Write-Host "Bitiful upload OK (runtime $Version)." -ForegroundColor Green
Write-Host "  Runtime: $(Get-VoiceAsrBitifulAssetUrl -FileName $RuntimeZipName)" -ForegroundColor Cyan
Write-Host "  Model:   $(Get-VoiceAsrBitifulAssetUrl -FileName $ModelZipName)" -ForegroundColor Cyan
Write-Host "  version.txt: $(Get-VoiceAsrBitifulVersionTxtUrl)" -ForegroundColor Cyan

exit 0
