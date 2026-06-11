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

if (-not $DistDir) {
    $DistDir = Join-Path $AgentGuiRoot 'electron\dist'
}

$versionJson = Get-Content (Join-Path $RepoRoot 'version.json') -Raw | ConvertFrom-Json
$expectedSemVer = Get-QuickerRpcSemVerFromVersion -Version ([string]$versionJson.QuickerRpc)

function Test-ElectronArtifacts {
    $setup = Get-ChildItem -LiteralPath $DistDir -Filter 'QuickerAgent-Electron-*-setup.exe' -ErrorAction SilentlyContinue |
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

    $unpackedExe = Join-Path $DistDir 'win-unpacked\QuickerAgent.exe'
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

function Stop-QuickerAgentElectron {
    Get-Process -Name 'QuickerAgent' -ErrorAction SilentlyContinue | ForEach-Object {
        Write-Host "Stopping QuickerAgent pid $($_.Id) (tree)" -ForegroundColor DarkYellow
        & taskkill.exe /PID $_.Id /T /F 2>$null | Out-Null
    }
    Stop-ElectronOrphanBackends
    Start-Sleep -Seconds 1
}

function Stop-ElectronOrphanBackends {
    # Force-killing QuickerAgent.exe skips before-quit; bundled node/qkrpc may linger on :3000+.
    $patterns = @(
        'electron[\\/]dist[\\/]win-unpacked[\\/]resources[\\/]resources',
        'electron[\\/]resources[\\/]app[\\/]server\.js'
    )
    $regex = ($patterns -join '|')

    Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -in @('node.exe', 'qkrpc.exe') -and $_.CommandLine -match $regex } |
        ForEach-Object {
            Write-Host "Stopping orphan $($_.Name) pid $($_.ProcessId)" -ForegroundColor DarkYellow
            & taskkill.exe /PID $_.ProcessId /T /F 2>$null | Out-Null
        }
}

function Test-UiHttpReady {
    param(
        [int]$Port,
        [string[]]$Paths = @('/', '/api/ping')
    )

    foreach ($path in $Paths) {
        try {
            $res = Invoke-WebRequest -Uri "http://127.0.0.1:$port$path" -TimeoutSec 2 -UseBasicParsing
            if ($res.StatusCode -eq 200) {
                return $path
            }
        }
        catch {
            # try next path
        }
    }

    return $null
}

function Wait-ForElectronUi {
    param([int]$TimeoutSec = 90)

    $deadline = (Get-Date).AddSeconds($TimeoutSec)
    while ((Get-Date) -lt $deadline) {
        for ($port = 3000; $port -le 3020; $port += 1) {
            $path = Test-UiHttpReady -Port $port
            if ($path) {
                Write-Host "Electron UI ready on http://127.0.0.1:$port$path" -ForegroundColor Green
                return $port
            }
        }

        Start-Sleep -Seconds 2
    }

    throw "Electron UI not ready within ${TimeoutSec}s (expected bundled Next on :3000-:3020)"
}

function Test-QkrpcHealthOptional {
    param([int]$TimeoutSec = 5)

    $deadline = (Get-Date).AddSeconds($TimeoutSec)
    while ((Get-Date) -lt $deadline) {
        try {
            $health = Invoke-RestMethod -Uri 'http://127.0.0.1:9477/health' -TimeoutSec 2
            if ($null -ne $health.ok) {
                $label = if ($health.ok) { 'OK' } else { 'reachable (plugin may be offline)' }
                Write-Host "qkrpc serve $label on :9477" -ForegroundColor $(if ($health.ok) { 'Green' } else { 'DarkYellow' })
                return $health
            }
        }
        catch {
            # retry
        }

        Start-Sleep -Seconds 1
    }

    Write-Host 'qkrpc serve not detected on :9477 (optional for UI smoke)' -ForegroundColor DarkGray
    return $null
}

function Start-ElectronLaunchSmoke {
    param([string]$ExePath)

    if (-not $ExePath -or -not (Test-Path -LiteralPath $ExePath)) {
        throw "win-unpacked QuickerAgent.exe not found: $ExePath"
    }

    Stop-QuickerAgentElectron
    Remove-Item "$env:TEMP\quicker-agent-electron-boot.log" -Force -ErrorAction SilentlyContinue

    Write-Host "Launching $ExePath ..." -ForegroundColor Cyan
    $launchEnv = @{}
    foreach ($key in [System.Environment]::GetEnvironmentVariables('Process').Keys) {
        if ($key -ne 'ELECTRON_RUN_AS_NODE') {
            $launchEnv[$key] = [System.Environment]::GetEnvironmentVariable($key, 'Process')
        }
    }
    $proc = Start-Process -FilePath $ExePath -PassThru -Environment $launchEnv
    try {
        $port = Wait-ForElectronUi -TimeoutSec $UiTimeoutSec
        $null = Test-QkrpcHealthOptional
        Write-Host "launch OK (pid $($proc.Id), port $port)" -ForegroundColor Green
    }
    finally {
        Stop-QuickerAgentElectron
        $bootLogs = @(
            (Join-Path $env:TEMP 'quicker-agent-electron-boot.log')
            (Join-Path $env:LOCALAPPDATA 'QuickerAgent\electron-boot.log')
        )
        foreach ($bootLog in $bootLogs) {
            if (Test-Path -LiteralPath $bootLog) {
                Write-Host "--- electron boot log ($bootLog) ---" -ForegroundColor DarkGray
                Get-Content -LiteralPath $bootLog | ForEach-Object { Write-Host $_ -ForegroundColor DarkGray }
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
        throw 'launch requires electron\dist\win-unpacked\QuickerAgent.exe (run pnpm electron:build)'
    }

    Start-ElectronLaunchSmoke -ExePath $artifacts.UnpackedExe
}

exit 0
