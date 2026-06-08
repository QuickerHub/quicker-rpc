#!/usr/bin/env pwsh
# Copy generated voice-plugin-channel manifest into QuickerAgent Tauri resources.

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
    [switch]$FromGitHubRelease
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

foreach ($dest in $channelPaths) {
    $destDir = Split-Path -Parent $dest
    New-Item -ItemType Directory -Force -Path $destDir | Out-Null
    Copy-Item -LiteralPath $generated -Destination $dest -Force
    Write-Host "Synced $dest" -ForegroundColor Green
}
