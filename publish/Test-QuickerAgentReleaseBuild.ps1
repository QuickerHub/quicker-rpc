#!/usr/bin/env pwsh
# Preflight tiers for QuickerAgent release validation.
#
# Examples:
#   pwsh ./publish/Test-QuickerAgentReleaseBuild.ps1 -FastOnly          # <10s
#   pwsh ./publish/Test-QuickerAgentReleaseBuild.ps1 -BuildOnly         # ~3–8 min, no NSIS
#   pwsh ./publish/Test-QuickerAgentReleaseBuild.ps1                    # full Electron NSIS build (slow)

[CmdletBinding()]
param(
    [string]$RepoRoot = '',
    [switch]$FastOnly,
    [switch]$BuildOnly,
    [switch]$SkipNextBuild,
    [switch]$SkipQkrpcBuild
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if (-not $RepoRoot) {
    $RepoRoot = Split-Path -Parent $PSScriptRoot
}

if ($FastOnly -and $BuildOnly) {
    throw 'Use only one of -FastOnly or -BuildOnly.'
}

if ($FastOnly) {
    & pwsh -NoProfile -File (Join-Path $PSScriptRoot 'Preflight-QuickerAgentFast.ps1') -RepoRoot $RepoRoot
    if ($LASTEXITCODE -ne 0) {
        throw "Fast preflight failed with exit code $LASTEXITCODE"
    }
    exit 0
}

if ($BuildOnly) {
    & pwsh -NoProfile -File (Join-Path $PSScriptRoot 'Preflight-QuickerAgentBuild.ps1') `
        -RepoRoot $RepoRoot `
        -SkipNextBuild:$SkipNextBuild `
        -SkipQkrpcBuild:$SkipQkrpcBuild
    if ($LASTEXITCODE -ne 0) {
        throw "Build preflight failed with exit code $LASTEXITCODE"
    }
    exit 0
}

$agentScript = Join-Path $PSScriptRoot 'Publish-QuickerAgent.ps1'
& pwsh -NoProfile -File $agentScript -RepoRoot $RepoRoot -SkipQkrpcBuild -PreflightOnly -SkipNextBuild:$SkipNextBuild
if ($LASTEXITCODE -ne 0) {
    throw "Test-QuickerAgentReleaseBuild failed with exit code $LASTEXITCODE"
}
