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
    [string]$ChannelPath = ''
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if (-not $RepoRoot) {
    $RepoRoot = Split-Path -Parent $PSScriptRoot
}
if (-not $VoiceRoot) {
    $VoiceRoot = Join-Path $RepoRoot 'voice-asr-runtime'
}
if (-not $ChannelPath) {
    $ChannelPath = Join-Path $RepoRoot 'agent-gui/src-tauri/resources/voice-plugin-channel.json'
}

$manifestScript = Join-Path $VoiceRoot 'publish/Write-VoicePluginChannelManifest.ps1'
if (-not (Test-Path -LiteralPath $manifestScript)) {
    throw "Missing manifest script: $manifestScript"
}

$generated = Join-Path $VoiceRoot 'publish/voice-plugin-channel.generated.json'
& pwsh -NoProfile -File $manifestScript -Version $Version -RuntimeTag $RuntimeTag -ModelTag $ModelTag -OutputPath $generated | Out-Null
if (-not (Test-Path -LiteralPath $generated)) {
    throw "Manifest generation failed: $generated"
}

$destDir = Split-Path -Parent $ChannelPath
New-Item -ItemType Directory -Force -Path $destDir | Out-Null
Copy-Item -LiteralPath $generated -Destination $ChannelPath -Force

Write-Host "Synced $ChannelPath" -ForegroundColor Green
