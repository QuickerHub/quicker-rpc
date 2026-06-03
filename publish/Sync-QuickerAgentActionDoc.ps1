#!/usr/bin/env pwsh
# Build and push QuickerAgent getquicker action page (aa5917ad) with QUICKER_AGENT_SEMVER from version.json.
#
# Examples:
#   pwsh ./publish/Sync-QuickerAgentActionDoc.ps1 -Push
#   pwsh ./publish/Sync-QuickerAgentActionDoc.ps1 -Version 0.9.0 -Push

[CmdletBinding()]
param(
    [string]$RepoRoot = '',
    [string]$Version = '',
    [switch]$Push,
    [switch]$DryRun
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

. (Join-Path $PSScriptRoot 'qkrpc-publish-lib.ps1')

if (-not $RepoRoot) {
    $RepoRoot = Split-Path -Parent $PSScriptRoot
}

if (-not $Version) {
    $versionFile = Join-Path $RepoRoot 'version.json'
    if (-not (Test-Path -LiteralPath $versionFile)) {
        throw "version.json not found: $versionFile"
    }

    $json = Get-Content -LiteralPath $versionFile -Raw | ConvertFrom-Json
    $Version = [string]$json.QuickerRpc
}

$semver = Get-QuickerRpcSemVerFromVersion -Version $Version
$sharedId = Get-QuickerAgentActionDocSharedId
$agentRepo = Resolve-QuickerAgentRepoRoot -QuickerRpcRepoRoot $RepoRoot
$buildScript = Join-Path $agentRepo 'scripts\build-action-docs.ps1'

if (-not (Test-Path -LiteralPath $buildScript)) {
    throw "build-action-docs.ps1 not found: $buildScript"
}

$qkagent = Get-Command qkagent -ErrorAction SilentlyContinue
if ($Push -and -not $qkagent) {
    throw 'qkagent not found on PATH. Build quicker-agent or add publish/agent to PATH.'
}

$env:QUICKER_AGENT_SEMVER = $semver
Write-Host "QUICKER_AGENT_SEMVER=$semver" -ForegroundColor Cyan
Write-Host "Action page: $agentRepo\actions\$sharedId\page.html" -ForegroundColor DarkCyan

Push-Location $agentRepo
try {
    if ($DryRun) {
        Write-Host "[DryRun] .\scripts\build-action-docs.ps1 -Id $sharedId" -ForegroundColor DarkGray
        if ($Push) {
            Write-Host "[DryRun] qkagent push --code $sharedId --json" -ForegroundColor DarkGray
        }

        exit 0
    }

    & pwsh -NoProfile -File $buildScript -Id $sharedId
    if ($LASTEXITCODE -ne 0) {
        throw "build-action-docs.ps1 failed ($LASTEXITCODE)"
    }

    if (-not $Push) {
        Write-Host 'Built info.html locally (no -Push).' -ForegroundColor Yellow
        exit 0
    }

    Write-Host "Pushing action doc ($sharedId)..." -ForegroundColor Cyan
    & $qkagent.Source push --code $sharedId --json
    if ($LASTEXITCODE -ne 0) {
        throw "qkagent push failed ($LASTEXITCODE)"
    }

    Write-Host "Action page synced for QuickerAgent $semver." -ForegroundColor Green
}
finally {
    Pop-Location
    Remove-Item Env:QUICKER_AGENT_SEMVER -ErrorAction SilentlyContinue
}

exit 0
