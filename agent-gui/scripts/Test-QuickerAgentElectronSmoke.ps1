#!/usr/bin/env pwsh
# Smoke checks for QuickerAgent Electron build artifacts (verify / launch).
#
# Usage:
#   pwsh ./scripts/Test-QuickerAgentElectronSmoke.ps1 -Action verify
#   pwsh ./scripts/Test-QuickerAgentElectronSmoke.ps1 -Action launch
#   pwsh ./scripts/Test-QuickerAgentElectronSmoke.ps1 -Action full

[CmdletBinding()]
param(
    [ValidateSet('verify', 'launch', 'full')]
    [string]$Action = 'verify',

    [string]$DistDir = '',
    [int]$UiTimeoutSec = 90
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$AgentGuiRoot = Split-Path -Parent $ScriptDir
$RepoRoot = Split-Path -Parent $AgentGuiRoot

. (Join-Path $RepoRoot 'publish\qkrpc-publish-lib.ps1')
. (Join-Path $ScriptDir 'lib/ElectronSmoke.ps1')

if (-not $DistDir) {
    $DistDir = Join-Path $AgentGuiRoot 'electron\dist'
}

$versionFile = Resolve-QuickerRpcVersionJsonPath -MonorepoRoot $RepoRoot
$versionJson = Get-Content -LiteralPath $versionFile -Raw | ConvertFrom-Json
$expectedSemVer = Get-QuickerRpcSemVerFromVersion -Version (Resolve-QuickerRpcVersionStringFromJsonObject -JsonObject $versionJson)

function Test-ElectronArtifacts {
    $setup = Get-ChildItem -LiteralPath $DistDir -Filter 'quicker-agent-*-x64-setup.exe' -ErrorAction SilentlyContinue |
        Sort-Object LastWriteTime -Descending |
        Select-Object -First 1
    if (-not $setup) {
        throw "Missing setup.exe under $DistDir"
    }

    $minBytes = 50MB
    if ($setup.Length -lt $minBytes) {
        throw "setup.exe too small ($($setup.Length) bytes): $($setup.FullName)"
    }

    $latestYml = Join-Path $DistDir 'latest.yml'
    Assert-QuickerAgentElectronLatestYmlFile -Path $latestYml -ExpectedSemVer $expectedSemVer

    $unpackedExe = Join-Path $DistDir 'win-unpacked\quicker-agent.exe'
    if (-not (Test-Path -LiteralPath $unpackedExe)) {
        $unpackedExe = Join-Path $DistDir 'win-unpacked\QuickerAgent.exe'
    }
    $hasUnpacked = Test-Path -LiteralPath $unpackedExe

    Write-Host 'verify OK:' -ForegroundColor Green
    Write-Host "  setup: $($setup.Name) ($([math]::Round($setup.Length / 1MB, 2)) MB)" -ForegroundColor Cyan
    Write-Host "  latest.yml: version $expectedSemVer" -ForegroundColor Cyan
    if ($hasUnpacked) {
        Write-Host "  win-unpacked: $unpackedExe" -ForegroundColor Cyan
    }
    else {
        Write-Host '  win-unpacked: (skipped — run electron:build first)' -ForegroundColor DarkGray
    }

    return @{
        Setup = $setup
        LatestYml = $latestYml
        UnpackedExe = if ($hasUnpacked) { $unpackedExe } else { $null }
    }
}

function Start-ElectronLaunchSmoke {
    param([string]$ExePath)

    if (-not $IsWindows) { throw 'Isolated Electron launch smoke currently requires Windows Job Objects.' }
    if (-not $ExePath -or -not (Test-Path -LiteralPath $ExePath)) { throw "win-unpacked QuickerAgent.exe not found: $ExePath" }
    Assert-ElectronSmokeBundleSupport $ExePath
    $run = New-ElectronSmokeRun $RepoRoot
    $launchEnvironment = Get-ElectronSmokeEnvironment $run
    if (-not ('QuickerAgent.Smoke.OwnedJob' -as [type])) {
        Add-Type -Path (Join-Path $ScriptDir 'lib/ElectronSmokeProcess.cs')
    }
    $arguments = '--user-data-dir="' + (Join-Path $run.Root 'profile') + '"'
    Write-Host "Launching isolated UI smoke; artifacts retained at $($run.Root)" -ForegroundColor Cyan
    try {
        $info = Invoke-OwnedElectronSmokeRun -Start {
            [QuickerAgent.Smoke.OwnedJob]::Start($ExePath, $arguments, $run.Root, $launchEnvironment)
        } -Wait {
            param($owner)
            Wait-OwnedElectronSmokeUi $run $owner $UiTimeoutSec
        }
        Write-Host "launch HTTP OK (owned pid $($info.rootPid), port $($info.uiPort)); host RPC disabled" -ForegroundColor Green
    }
    finally {
        foreach ($bootLog in @(
            (Join-Path $run.Root 'temp/quicker-agent-electron-boot.log'),
            (Join-Path $run.Root 'local/QuickerAgent/electron-boot.log')
        )) {
            if (Test-Path -LiteralPath $bootLog -PathType Leaf) {
                Write-Host "Smoke boot log: $bootLog" -ForegroundColor DarkGray
                Get-Content -LiteralPath $bootLog -Tail 100 | ForEach-Object { Write-Host $_ -ForegroundColor DarkGray }
            }
        }
    }
}
$artifacts = Test-ElectronArtifacts

if ($Action -eq 'verify') {
    exit 0
}

if ($Action -in @('launch', 'full')) {
    if (-not $artifacts.UnpackedExe) {
        throw 'launch requires electron\dist\win-unpacked\quicker-agent.exe (run pnpm electron:build)'
    }

    Start-ElectronLaunchSmoke -ExePath $artifacts.UnpackedExe
}

exit 0
