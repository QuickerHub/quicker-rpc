#!/usr/bin/env pwsh
# Monorepo wrapper: build/publish voice-asr-runtime (GitHub + optional Bitiful + channel.json).

[CmdletBinding()]
param(
    [string]$RepoRoot = '',
    [string]$Version = '',
    [switch]$SkipBuild,
    [switch]$UploadBitiful,
    [switch]$UpdateChannelJson,
    [switch]$ForceRetag,
    [switch]$Draft,
    [switch]$DryRun
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if (-not $RepoRoot) {
    $RepoRoot = Split-Path -Parent $PSScriptRoot
}

$releaseScript = Join-Path $RepoRoot 'voice-asr-runtime/publish/Publish-VoiceAsrRelease.ps1'
if (-not (Test-Path -LiteralPath $releaseScript)) {
    throw "Missing voice-asr-runtime publish script: $releaseScript"
}

$argsList = @(
    '-NoProfile', '-File', $releaseScript,
    '-MonorepoRoot', $RepoRoot
)
if ($Version) { $argsList += @('-Version', $Version) }
if ($SkipBuild) { $argsList += '-SkipBuild' }
if ($UploadBitiful) { $argsList += '-UploadBitiful' }
if ($UpdateChannelJson) { $argsList += '-UpdateChannelJson' }
if ($ForceRetag) { $argsList += '-ForceRetag' }
if ($Draft) { $argsList += '-Draft' }
if ($DryRun) { $argsList += '-DryRun' }

& pwsh @argsList
if ($LASTEXITCODE -ne 0) {
    throw "voice-asr release failed ($LASTEXITCODE)"
}
