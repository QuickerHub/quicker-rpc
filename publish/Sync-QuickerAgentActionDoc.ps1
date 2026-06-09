#!/usr/bin/env pwsh
# Build and push QuickerAgent getquicker action page (aa5917ad) with QUICKER_AGENT_SEMVER.
# Default version: Bitiful version.txt (not version.json). Pass -Version to override.
#
# Examples:
#   pwsh ./publish/Sync-QuickerAgentActionDoc.ps1 -Push
#   pwsh ./publish/Sync-QuickerAgentActionDoc.ps1 -Version 0.9.2 -Push

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
    # Action page download links must match Bitiful (version.txt), not unreleased version.json bumps.
    $Version = Get-QuickerAgentBitifulPublishedSemVer
    Write-Host "Version from Bitiful version.txt: $Version" -ForegroundColor DarkCyan
}

$semver = Get-QuickerRpcSemVerFromVersion -Version $Version
$sharedId = Get-QuickerAgentActionDocSharedId
$agentRepo = Resolve-QuickerAgentRepoRoot -QuickerRpcRepoRoot $RepoRoot
$buildScript = Join-Path $agentRepo 'scripts\build-action-docs.ps1'

if (-not (Test-Path -LiteralPath $buildScript)) {
    throw "build-action-docs.ps1 not found: $buildScript"
}

$qkrpc = Get-Command qkrpc -ErrorAction SilentlyContinue
$qkagent = Get-Command qkagent -ErrorAction SilentlyContinue
if ($Push -and -not $qkrpc -and -not $qkagent) {
    throw 'Neither qkrpc nor qkagent found on PATH.'
}

$env:QUICKER_AGENT_SEMVER = $semver
Write-Host "QUICKER_AGENT_SEMVER=$semver" -ForegroundColor Cyan
Write-Host "Action page: $agentRepo\actions\$sharedId\page.html" -ForegroundColor DarkCyan

Push-Location $agentRepo
try {
    if ($DryRun) {
        Write-Host "[DryRun] .\scripts\build-action-docs.ps1 -Id $sharedId" -ForegroundColor DarkGray
        if ($Push) {
            if ($qkrpc) {
                Write-Host "[DryRun] qkrpc action shared-info-set --id $sharedId --html-file ...\info.html --json" -ForegroundColor DarkGray
            }
            else {
                Write-Host "[DryRun] qkagent push --code $sharedId --json" -ForegroundColor DarkGray
            }
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

    $infoHtml = Join-Path $agentRepo "actions\$sharedId\info.html"
    if (-not (Test-Path -LiteralPath $infoHtml)) {
        throw "info.html not found: $infoHtml"
    }

    Write-Host "Pushing action doc ($sharedId)..." -ForegroundColor Cyan
    if ($qkrpc) {
        & $qkrpc.Source action shared-info-set --id $sharedId --html-file $infoHtml --json --timeout 120
        if ($LASTEXITCODE -ne 0) {
            throw "qkrpc action shared-info-set failed ($LASTEXITCODE)"
        }
    }
    else {
        & $qkagent.Source push --code $sharedId --json
        if ($LASTEXITCODE -ne 0) {
            throw "qkagent push failed ($LASTEXITCODE)"
        }
    }

    Write-Host "Action page synced for QuickerAgent $semver." -ForegroundColor Green
}
finally {
    Pop-Location
    Remove-Item Env:QUICKER_AGENT_SEMVER -ErrorAction SilentlyContinue
}

exit 0
