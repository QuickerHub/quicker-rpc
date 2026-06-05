#!/usr/bin/env pwsh
# Upload voice-asr runtime + model zips to Bitiful (domestic CDN for QuickerAgent one-click install).
#
# Examples:
#   pwsh ./publish/Upload-VoiceAsrToBitiful.ps1 -Version 0.1.0
#   pwsh ./publish/Upload-VoiceAsrToBitiful.ps1 -Version 0.1.0 -UseLocalVoiceRoot
#   pwsh ./publish/Upload-VoiceAsrToBitiful.ps1 -Version 0.1.0 -DryRun

[CmdletBinding()]
param(
    [string]$RepoRoot = '',
    [string]$Version = '0.1.0',
    [string]$Tag = '',
    [switch]$UseLocalVoiceRoot,
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

if (-not $Tag) {
    $Tag = "v$Version"
}
else {
    $Tag = $Tag.Trim()
    if (-not $Tag.StartsWith('v')) {
        $Tag = "v$Tag"
    }
}

$VoiceRoot = Join-Path $RepoRoot 'voice-asr-runtime'
$PublishDir = Join-Path $VoiceRoot 'publish'
$RuntimeZipName = Get-VoiceAsrRuntimeZipName -Version $Version
$ModelZipName = Get-VoiceAsrModelZipName -Version $Version
$RuntimeZip = Join-Path $PublishDir $RuntimeZipName
$ModelZip = Join-Path $PublishDir $ModelZipName

function Resolve-VoiceAsrAsset {
    param(
        [string]$LocalPath,
        [string]$AssetName
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

$runtimePath = Resolve-VoiceAsrAsset -LocalPath $RuntimeZip -AssetName $RuntimeZipName
$modelPath = Resolve-VoiceAsrAsset -LocalPath $ModelZip -AssetName $ModelZipName

if ($DryRun) {
    Write-Host "[DryRun] Would upload:" -ForegroundColor DarkGray
    Write-Host "  $runtimePath"
    Write-Host "  $modelPath"
    Write-Host "[DryRun] version.txt -> $Version" -ForegroundColor DarkGray
    Write-Host "  runtime URL: $(Get-VoiceAsrBitifulAssetUrl -FileName $RuntimeZipName)" -ForegroundColor DarkGray
    Write-Host "  model URL:   $(Get-VoiceAsrBitifulAssetUrl -FileName $ModelZipName)" -ForegroundColor DarkGray
    exit 0
}

Invoke-VoiceAsrBitifulUpload -RuntimeZipPath $runtimePath -ModelZipPath $modelPath -Version $Version -PublishDir $PSScriptRoot

Write-Host ''
Write-Host "Bitiful upload OK ($Version)." -ForegroundColor Green
Write-Host "  Runtime: $(Get-VoiceAsrBitifulAssetUrl -FileName $RuntimeZipName)" -ForegroundColor Cyan
Write-Host "  Model:   $(Get-VoiceAsrBitifulAssetUrl -FileName $ModelZipName)" -ForegroundColor Cyan
Write-Host "  version.txt: $(Get-VoiceAsrBitifulVersionTxtUrl)" -ForegroundColor Cyan

exit 0
