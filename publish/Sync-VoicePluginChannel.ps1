#!/usr/bin/env pwsh
# Sync voice-plugin channel manifest: optional local fallback + optional Bitiful mirror upload.
#
# Runtime releases no longer require monorepo channel commits for installed users to update.
# Use -UploadRemote after each voice-asr-runtime release so QuickerAgent fetches the mirror.
#
# Examples:
#   pwsh ./publish/Sync-VoicePluginChannel.ps1 -Version 0.1.3 -FromGitHubRelease -UploadRemote
#   pwsh ./publish/Sync-VoicePluginChannel.ps1 -Version 0.1.3 -SkipLocalSync -UploadRemote

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$Version,

    [string]$RuntimeTag = '',
    [string]$ModelTag = 'model-sensevoice',
    [string]$VoiceRoot = '',
    [string]$RepoRoot = '',
    [string]$ChannelPath = '',
    [string]$GitHubRepo = 'QuickerHub/voice-asr-runtime',
    [switch]$FromGitHubRelease,
    [switch]$UploadRemote,
    [switch]$SkipLocalSync
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if (-not $RepoRoot) {
    $RepoRoot = Split-Path -Parent $PSScriptRoot
}
if (-not $VoiceRoot) {
    $VoiceRoot = Join-Path $RepoRoot 'voice-asr-runtime'
}
if (-not $RuntimeTag) {
    $RuntimeTag = "v$($Version.Trim())"
}
elseif (-not $RuntimeTag.Trim().StartsWith('v')) {
    $RuntimeTag = "v$($RuntimeTag.Trim())"
}

$defaultChannelPaths = @(
    (Join-Path $RepoRoot 'agent-gui/electron/resources/voice-plugin-channel.json'),
    (Join-Path $RepoRoot 'agent-gui/src-tauri/resources/voice-plugin-channel.json'),
    (Join-Path $RepoRoot 'agent-gui/src-tauri/voice-plugin-metadata/voice-plugin-channel.json')
)
$channelPaths = if ($ChannelPath) { @($ChannelPath) } else { $defaultChannelPaths }

$publishDir = Join-Path $VoiceRoot 'publish'
$generated = Join-Path $publishDir 'voice-plugin-channel.generated.json'

if ($FromGitHubRelease) {
    if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
        throw 'GitHub CLI (gh) is required for -FromGitHubRelease.'
    }
    New-Item -ItemType Directory -Force -Path $publishDir | Out-Null
    & gh release download $RuntimeTag --repo $GitHubRepo --pattern 'voice-plugin-channel.generated.json' -D $publishDir --clobber
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $generated)) {
        throw "Could not download voice-plugin-channel.generated.json from release $RuntimeTag ($GitHubRepo)."
    }
    Write-Host "Downloaded manifest from GitHub Release $RuntimeTag" -ForegroundColor Cyan
}
else {
    $manifestScript = Join-Path $VoiceRoot 'publish/Write-VoicePluginChannelManifest.ps1'
    if (-not (Test-Path -LiteralPath $manifestScript)) {
        throw "Missing manifest script: $manifestScript"
    }
    & pwsh -NoProfile -File $manifestScript -Version $Version -RuntimeTag $RuntimeTag -ModelTag $ModelTag -OutputPath $generated | Out-Null
    if (-not (Test-Path -LiteralPath $generated)) {
        throw "Manifest generation failed: $generated"
    }
}

if (-not $SkipLocalSync) {
    foreach ($dest in $channelPaths) {
        $destDir = Split-Path -Parent $dest
        New-Item -ItemType Directory -Force -Path $destDir | Out-Null
        Copy-Item -LiteralPath $generated -Destination $dest -Force
        Write-Host "Synced embedded fallback: $dest" -ForegroundColor Green
    }
    Write-Host 'Note: embedded fallback is for offline only; update infrequently.' -ForegroundColor DarkGray
}
else {
    Write-Host 'Skipped local embedded channel sync (-SkipLocalSync).' -ForegroundColor DarkGray
}

if ($UploadRemote) {
    . (Join-Path $PSScriptRoot 'qkrpc-publish-lib.ps1')
    Import-BitifulEnvFromFiles -PublishDir $PSScriptRoot
    if (-not (Test-BitifulConfigured)) {
        throw 'Bitiful credentials required for -UploadRemote (publish/.env).'
    }

    $uploadScript = Join-Path $PSScriptRoot 'bitiful_upload.py'
    if (-not (Test-Path -LiteralPath $uploadScript)) {
        throw "bitiful_upload.py not found: $uploadScript"
    }

    $endpointUrl = if ([string]::IsNullOrWhiteSpace($env:BITIFUL_ENDPOINT_URL)) {
        'https://s3.bitiful.net'
    }
    else {
        $env:BITIFUL_ENDPOINT_URL.Trim()
    }

    $objectPrefix = if ([string]::IsNullOrWhiteSpace($env:BITIFUL_VOICE_ASR_OBJECT_PREFIX)) {
        'quicker-rpc/voice-asr'
    }
    else {
        $env:BITIFUL_VOICE_ASR_OBJECT_PREFIX.Trim()
    }

    $remoteKey = 'voice-plugin-channel.json'
    $tempCopy = Join-Path $publishDir $remoteKey
    Copy-Item -LiteralPath $generated -Destination $tempCopy -Force

    $commonArgs = @(
        $uploadScript, $tempCopy,
        '--asset',
        '--endpoint-url', $endpointUrl,
        '--object-prefix', $objectPrefix
    )

    if (Get-Command uv -ErrorAction SilentlyContinue) {
        & uv run --no-sync --with boto3 python @commonArgs
    }
    elseif (Get-Command python -ErrorAction SilentlyContinue) {
        & python @commonArgs
    }
    else {
        throw 'Neither uv nor python found for Bitiful upload.'
    }

    if ($LASTEXITCODE -ne 0) {
        throw "Bitiful channel upload failed with exit code $LASTEXITCODE"
    }

    $mirrorUrl = "$(Get-VoiceAsrBitifulDownloadPrefix)/$remoteKey"
    Write-Host "Uploaded remote channel mirror: $mirrorUrl" -ForegroundColor Green
}

Write-Host "Done. runtimeVersion in manifest:" -ForegroundColor Cyan
(Get-Content -LiteralPath $generated -Raw | ConvertFrom-Json).runtimeVersion
